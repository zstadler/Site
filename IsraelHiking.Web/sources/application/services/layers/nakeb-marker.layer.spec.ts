﻿import { Injector, ComponentFactoryResolver, ApplicationRef } from "@angular/core";
import { HttpModule, Http, Response, ResponseOptions, XHRBackend } from "@angular/http";
import { TestBed, async, inject, fakeAsync, flushMicrotasks } from "@angular/core/testing";
import { MockBackend, MockConnection, } from "@angular/http/testing";
import { NakebMarkerLayer } from "./nakeb-marker.layer";
import { MapServiceMockCreator } from "../map.service.spec";
import { ResourcesService } from "../ResourcesService";
import { MapService } from "../MapService";

describe("NakebMarkerLayer", () => {
    var mapServiceMock: MapServiceMockCreator;

    beforeEach(() => {
        mapServiceMock = new MapServiceMockCreator();
        let componentRefMock = {
            instance: {
                setMarker: () => { }
            },
        };
        let factory = {
            create: () => { return componentRefMock }
        };
        var applicationRefMock = {
            attachView: () => { }
        };
        var componentFactoryResolver = {
            resolveComponentFactory: () => { return factory }
        };
        TestBed.configureTestingModule({
            imports: [HttpModule],
            providers: [
                { provide: MapService, useValue: mapServiceMock.mapService },
                { provide: ResourcesService, useValue: mapServiceMock.resourcesService },
                { provide: XHRBackend, useClass: MockBackend },
                NakebMarkerLayer,
                Injector,
                { provide: ComponentFactoryResolver, useValue: componentFactoryResolver },
                { provide: ApplicationRef, useValue: applicationRefMock },
            ]
        });
        (mapServiceMock.mapService.map as any)._layersMaxZoom = 19; // workaround for markercluster issue - removing this line will make the tests freeze.
    });

    afterEach(() => {
        mapServiceMock.destructor();
    })

    it("Should fetch markers when initialized", inject([XHRBackend, Http, MapService, Injector, ComponentFactoryResolver, ApplicationRef],
        fakeAsync((mockBackend: MockBackend, http: Http, mapService: MapService, injector: Injector, componentFactoryResolver: ComponentFactoryResolver, applicationRef: ApplicationRef) => {
            let wasCalled = false;
            mockBackend.connections.subscribe((connection: MockConnection) => {
                wasCalled = true;
                connection.mockRespond(new Response(new ResponseOptions({
                    body: JSON.stringify([{
                        id: 1,
                        start: { lat: "32", lng: "35" },
                    }])
                })))
            });

            let nakebLayer = new NakebMarkerLayer(mapService, http, injector, componentFactoryResolver, applicationRef);

            flushMicrotasks();
            expect(wasCalled).toBeTruthy();
        })));

    it("Should run on add when adding to map", inject([NakebMarkerLayer], (nakebLayer: NakebMarkerLayer) => {
        spyOn(nakebLayer, "onAdd");

        mapServiceMock.mapService.map.addLayer(nakebLayer);

        expect(nakebLayer.onAdd).toHaveBeenCalled();
    }));

    it("Should run on remove when removing from map", inject([NakebMarkerLayer], (nakebLayer: NakebMarkerLayer) => {
        spyOn(nakebLayer, "onRemove");

        mapServiceMock.mapService.map.addLayer(nakebLayer);
        mapServiceMock.mapService.map.removeLayer(nakebLayer);

        expect(nakebLayer.onRemove).toHaveBeenCalled();
    }));

    it("Should update markers when moving map", inject([XHRBackend, Http, MapService, Injector, ComponentFactoryResolver, ApplicationRef],
        fakeAsync((mockBackend: MockBackend, http: Http, mapService: MapService, injector: Injector, componentFactoryResolver: ComponentFactoryResolver, applicationRef: ApplicationRef) => {
            mockBackend.connections.subscribe((connection: MockConnection) => {
                connection.mockRespond(new Response(new ResponseOptions({
                    body: JSON.stringify([{
                        id: 1,
                        start: { lat: "32", lng: "35" },
                    }])
                })))
            });
            let nakebLayer = new NakebMarkerLayer(mapService, http, injector, componentFactoryResolver, applicationRef);
            flushMicrotasks();
            mapServiceMock.mapService.map.addLayer(nakebLayer);
            let numberOflayersBefore = 0;
            mapServiceMock.mapService.map.eachLayer(() => numberOflayersBefore++);
            mapServiceMock.mapService.map.setView(L.latLng(32, 35), 15);

            let numberOflayersAfter = 0;
            mapServiceMock.mapService.map.eachLayer(() => numberOflayersAfter++);
            expect(numberOflayersAfter).toBeGreaterThan(numberOflayersBefore);
        })));
});