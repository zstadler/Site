import { Component, AfterViewInit, ViewEncapsulation } from "@angular/core";
import { Observable } from "rxjs";
import { MapComponent } from "@maplibre/ngx-maplibre-gl";
import { MapLayerMouseEvent } from "maplibre-gl";
import { NgRedux, Select } from "@angular-redux2/store";
import invert from "invert-color";

import { BaseMapComponent } from "../base-map.component";
import { SelectedRouteService } from "../../services/selected-route.service";
import { SpatialService } from "../../services/spatial.service";
import { ResourcesService } from "../../services/resources.service";
import { FileService } from "../../services/file.service";
import { RouteEditPoiInteraction } from "../intercations/route-edit-poi.interaction";
import { RouteEditRouteInteraction } from "../intercations/route-edit-route.interaction";
import { Urls } from "../../urls";
import type { LatLngAlt, ApplicationState, RouteData, RecordedRoute } from "../../models/models";

type RouteViewProperties = {
    color: string;
    iconColor: string;
    iconSize: number;
    weight: number;
    opacity: number;
    name?: string;
    id?: string;
};

interface RoutePointViewData {
    latlng: LatLngAlt;
    segmentIndex: number;
}

@Component({
    selector: "routes",
    templateUrl: "./routes.component.html",
    styleUrls: ["./routes.component.scss"],
    encapsulation: ViewEncapsulation.None
})
export class RoutesComponent extends BaseMapComponent implements AfterViewInit {

    private static readonly START_COLOR = "#43a047";
    private static readonly END_COLOR = "red";

    @Select((state: ApplicationState) => state.routes.present)
    public routes$: Observable<RouteData[]>;

    @Select((state: ApplicationState) => state.routeEditingState.selectedRouteId)
    public selectedRouteId$: Observable<RouteData[]>;

    @Select((state: ApplicationState) => state.recordedRouteState.route)
    public recordedRoute$: Observable<RecordedRoute>;

    @Select((state: ApplicationState) => state.recordedRouteState.isAddingPoi)
    public isAddingPoi$: Observable<boolean>;

    public routePointPopupData: RoutePointViewData;
    public nonEditRoutePointPopupData: { latlng: LatLngAlt; wazeAddress: string; routeId: string};

    public editingRoute: GeoJSON.FeatureCollection<GeoJSON.LineString | GeoJSON.Point>;
    public routesGeoJson: GeoJSON.FeatureCollection<GeoJSON.LineString | GeoJSON.Point>;

    private routes: RouteData[];

    constructor(resources: ResourcesService,
                private readonly selectedRouteService: SelectedRouteService,
                private readonly routeEditPoiInteraction: RouteEditPoiInteraction,
                private readonly routeEditRouteInteraction: RouteEditRouteInteraction,
                private readonly fileService: FileService,
                private readonly mapComponent: MapComponent,
                private readonly ngRedux: NgRedux<ApplicationState>
    ) {
        super(resources);
        this.routesGeoJson = {
            type: "FeatureCollection",
            features: []
        };
        this.editingRoute = {
            type: "FeatureCollection",
            features: []
        };
        this.routes = [];
        this.routeEditRouteInteraction.onRoutePointClick.subscribe(this.handleRoutePointClick);
        this.routes$.subscribe(this.handleRoutesChanges);
        this.selectedRouteId$.subscribe(() => this.handleRoutesChanges(this.routes));
        this.recordedRoute$.subscribe(this.buildFeatureCollections);
        this.isAddingPoi$.subscribe(() => this.setInteractionAccordingToState());
    }

    private handleRoutesChanges = (routes: RouteData[]) => {
        this.routes = routes;
        this.setInteractionAccordingToState();
        this.buildFeatureCollections();
    };

    private buildFeatureCollections = () => {
        let features = [] as GeoJSON.Feature<GeoJSON.LineString | GeoJSON.Point>[];
        let editingFeatures = [] as GeoJSON.Feature<GeoJSON.LineString | GeoJSON.Point>[];
        for (let route of this.routes) {
            if (route.state === "Hidden") {
                continue;
            }
            if (route.state === "Route") {
                editingFeatures = this.createFeaturesForEditingRoute(route);
                continue;
            }
            let latlngs = this.selectedRouteService.getLatlngs(route);
            features = features.concat(this.createFeaturesForRoute(latlngs, this.routeToProperties(route), false));
        }
        if (this.ngRedux.getState().recordedRouteState.isRecording) {
            let latlngs = this.ngRedux.getState().recordedRouteState.route.latlngs;
            let properties = {
                color: this.resources.recordedRouteColor,
                iconColor: invert(this.resources.recordedRouteColor, true),
                opacity: 1.0,
                weight: 6,
                iconSize: 0.5
            } as RouteViewProperties;
            features = features.concat(this.createFeaturesForRoute(latlngs, properties, true));
        }
        this.routesGeoJson = {
            type: "FeatureCollection",
            features
        };
        this.editingRoute = {
            type: "FeatureCollection",
            features: editingFeatures
        };
        this.routeEditRouteInteraction.setData(this.editingRoute);
    };

    private handleRoutePointClick = (pointIndex: number) => {
        if (pointIndex == null || (this.routePointPopupData != null && this.routePointPopupData.segmentIndex === pointIndex)) {
            this.routePointPopupData = null;
            return;
        }
        let selectedRoute = this.selectedRouteService.getSelectedRoute();
        let segment = selectedRoute.segments[pointIndex];
        setTimeout(() => {
            // allow angular to draw this as it seems not to do it without this timeout...
            this.routePointPopupData = {
                latlng: segment.routePoint,
                segmentIndex: pointIndex,
            };
        }, 0);
    };

    public closeRoutePointPopup() {
        this.routePointPopupData = null;
    }

    private createFeaturesForEditingRoute(route: RouteData): GeoJSON.Feature<GeoJSON.LineString | GeoJSON.Point>[] {
        let features = [] as GeoJSON.Feature<GeoJSON.LineString | GeoJSON.Point>[];
        for (let segmentIndex = 0; segmentIndex < route.segments.length; segmentIndex++) {
            let segmentFeature = {
                type: "Feature",
                id: RouteEditRouteInteraction.createSegmentId(route, segmentIndex),
                properties: this.routeToProperties(route),
                geometry: {
                    type: "LineString",
                    coordinates: route.segments[segmentIndex].latlngs.map(l => SpatialService.toCoordinate(l))
                }
            } as GeoJSON.Feature<GeoJSON.LineString>;
            segmentFeature.properties.id = RouteEditRouteInteraction.createSegmentId(route, segmentIndex);
            features.push(segmentFeature);
            let segmentPointFeature = {
                type: "Feature",
                id: RouteEditRouteInteraction.createSegmentPointId(route, segmentIndex),
                properties: this.routeToProperties(route),
                geometry: {
                    type: "Point",
                    coordinates: SpatialService.toCoordinate(route.segments[segmentIndex].routePoint)
                }
            } as GeoJSON.Feature<GeoJSON.Point>;
            segmentPointFeature.properties.id = RouteEditRouteInteraction.createSegmentPointId(route, segmentIndex);
            if (segmentIndex === 0) {
                segmentPointFeature.properties.color = RoutesComponent.START_COLOR;
            } else if (segmentIndex === route.segments.length - 1) {
                segmentPointFeature.properties.color = RoutesComponent.END_COLOR;
            }
            features.push(segmentPointFeature);
        }
        return features;
    }

    private createFeaturesForRoute(
        latlngs: LatLngAlt[],
        routeProperties: RouteViewProperties,
        isRecordingRoute: boolean): GeoJSON.Feature<GeoJSON.LineString | GeoJSON.Point>[] {
        let features = [] as GeoJSON.Feature<GeoJSON.LineString | GeoJSON.Point>[];;
        let routeCoordinates = latlngs.map(l => SpatialService.toCoordinate(l));
        if (routeCoordinates.length < 2) {
            return features;
        }
        let properties = {...routeProperties};
        features.push(
            {
                type: "Feature",
                id: routeProperties.id,
                properties,
                geometry: {
                    type: "LineString",
                    coordinates: routeCoordinates
                }
            });
        properties = {...routeProperties};
        properties.color = RoutesComponent.START_COLOR;
        properties.id = routeProperties.id + "_start";
        features.push(
            {
                type: "Feature",
                id: properties.id,
                properties,
                geometry: {
                    type: "Point",
                    coordinates: routeCoordinates[0]
                }
            });
        if (isRecordingRoute) {
            return features;
        }
        properties = {...routeProperties};
        properties.color = RoutesComponent.END_COLOR;
        properties.id = routeProperties.id + "_end";
        features.push(
            {
                type: "Feature",
                id: properties.id,
                properties,
                geometry: {
                    type: "Point",
                    coordinates: routeCoordinates[routeCoordinates.length - 1]
                }
            });
        return features;
    }

    private routeToProperties(route: RouteData): RouteViewProperties {
        let color = route.color;
        let opacity = route.opacity || 1.0;
        let width = route.weight;
        let iconColor = opacity > 0.5 ? invert(color, true) : color;
        let iconSize = width < 10 ? 0.5 : 0.5 * width / 10.0;
        return {
            color,
            iconColor,
            iconSize,
            weight: width,
            opacity,
            name: route.name,
            id: route.id
        };
    }

    private setInteractionAccordingToState() {
        if (this.mapComponent.mapInstance == null) {
            return;
        }
        this.routeEditPoiInteraction.setActive(false, this.mapComponent.mapInstance);
        this.routeEditRouteInteraction.setActive(false, this.mapComponent.mapInstance);
        let selectedRoute = this.selectedRouteService.getSelectedRoute();
        this.mapComponent.mapInstance.getCanvas().style.cursor = "";
        if (this.ngRedux.getState().recordedRouteState.isAddingPoi ||
            (selectedRoute && selectedRoute.state === "Poi")) {
            this.routeEditPoiInteraction.setActive(true, this.mapComponent.mapInstance);
            this.mapComponent.mapInstance.getCanvas().style.cursor = "pointer";
        } else if (selectedRoute && selectedRoute.state === "Route") {
            this.routeEditRouteInteraction.setActive(true, this.mapComponent.mapInstance);
            this.mapComponent.mapInstance.getCanvas().style.cursor = "pointer";
        }
    }

    public markerDragEnd(index: number, event: any) {
        this.routeEditPoiInteraction.handleDragEnd(event.getLngLat(), index);
    }

    public ngAfterViewInit(): void {
        this.mapComponent.mapLoad.subscribe(async () => {
            this.setInteractionAccordingToState();
            let fullUrl = this.fileService.getFullUrl("content/arrow.png");
            this.mapComponent.mapInstance.loadImage(fullUrl, (_: Error, image: HTMLImageElement | ImageBitmap) => {
                this.mapComponent.mapInstance.addImage("arrow", image, { sdf: true });
            });
        });
    }

    private isEditMode(): boolean {
        let selectedRoute = this.selectedRouteService.getSelectedRoute();
        return selectedRoute != null && (selectedRoute.state === "Poi" || selectedRoute.state === "Route");
    }

    public isLast(segmentIndex: number, routeData: RouteData) {
        return segmentIndex === routeData.segments.length - 1;
    }

    public isRouteInEditPoiMode(route: RouteData) {
        let selectedRoute = this.selectedRouteService.getSelectedRoute();
        return selectedRoute != null && selectedRoute.id === route.id && selectedRoute.state === "Poi";
    }

    public routeLineMouseEnter(event: any) {
        this.mapComponent.mapInstance.getCanvas().style.cursor = "pointer";
        this.routeLineMouseOver(event);
    }

    public routeLineMouseOver(event: any) {
        let selectedRoute = this.selectedRouteService.getSelectedRoute();
        if (selectedRoute == null) {
            return;
        }
        if (event.features == null || event.features.length === 0) {
            return;
        }
        if (event.features[0].properties.id !== selectedRoute.id) {
            return;
        }
        this.selectedRouteService.raiseHoverSelectedRoute(event.lngLat);
    }

    public routeLineMouseLeave() {
        this.selectedRouteService.raiseHoverSelectedRoute(null);
        if (!this.isEditMode()) {
            this.mapComponent.mapInstance.getCanvas().style.cursor = "";
        }
    }

    public routeLineClick(event: MapLayerMouseEvent) {
        if (event.features == null || event.features.length === 0) {
            return;
        }
        let selectedRoute = this.selectedRouteService.getSelectedRoute();
        let clickedRoute = this.selectedRouteService.getRouteById(event.features[0].properties.id);
        if (clickedRoute != null && clickedRoute !== selectedRoute && !this.isEditMode()) {
            this.selectedRouteService.setSelectedRoute(clickedRoute.id);
        }
    }

    public nonEditRoutePointClick(event: MapLayerMouseEvent) {
        // this event is only fired for routes that are not in edit mode since other interactions are handled in the route edit class
        if (this.isEditMode()) {
            return;
        }
        let pointId = event.features[0].properties.id as string;
        let routeId = pointId.replace("_start", "").replace("_end", "");
        this.nonEditRoutePointPopupData = {
            latlng: event.lngLat,
            wazeAddress: `${Urls.waze}${event.lngLat.lat},${event.lngLat.lng}`,
            routeId
        };
    }

    public switchToEditMode(routeId: string) {
        this.selectedRouteService.setSelectedRoute(routeId);
        this.selectedRouteService.changeRouteEditState(routeId, "Route");
        this.nonEditRoutePointPopupData = null;
    }
}
