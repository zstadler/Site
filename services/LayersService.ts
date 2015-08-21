﻿declare module L {
    export class Google { new() }
}

declare var getLastModifiedDate: Function;

module IsraelHiking.Services {
    export interface ILayer {
        key: string;
        layer: L.TileLayer;
    }

    export interface ILayerData {
        key: string;
        address: string;
        minZoom: number;
        maxZoom: number;
    }

    export interface IBaseLayer extends ILayer {
        selected: boolean
    }

    export interface IOvelay extends ILayer {
        visible: boolean;
    }

    export interface IRouteViewOptions {
        pathOptions: L.PathOptions;
        isVisible: boolean;
    }

    export class LayersService extends ObjectWithMap {
        public static MAX_ZOOM = 20;
        public static ISRAEL_MTB_MAP = "Israel MTB map";

        private static ISRAEL_HIKING_MAP = "Israel Hiking map";
        private static GOOGLE_EARTH = "Google Earth";
        private static HIKING_TRAILS = "Hiking trails";
        private static ATTRIBUTION = "Map data &copy; <a href='http://openstreetmap.org' target='_blank'>OpenStreetMap</a> contributors, <a href='http://creativecommons.org/licenses/by-sa/2.0/' target='_blank\">CC-BY-SA</a>, built with <a href='http://getbootstrap.com/' target='_blank'>Bootstrap</a>. ";
        private static MTB_ATTRIBUTION = LayersService.ATTRIBUTION + "Map style courtesy of <a http='http://mtbmap.no'>MTBmap.no.</a> ";
        private static BASE_LAYERS_KEY = "BaseLayers";
        private static OVERLAYS_KEY = "Overlays";

        private $http: angular.IHttpService;
        private localStorageService: angular.local.storage.ILocalStorageService;
        private hashService: HashService;
        private drawingFactory: Drawing.DrawingFactory;
        private tileLayerOptions: L.TileLayerOptions;
        private overlayZIndex;

        public baseLayers: IBaseLayer[];
        public overlays: IOvelay[];
        public markers: Drawing.DrawingMarker;
        public routes: Drawing.DrawingRoute[];
        public eventHelper: Common.EventHelper<Common.IDataChangedEventArgs>
        public selectedBaseLayer: IBaseLayer;
        public selectedDrawing: Drawing.IDrawing;

        constructor($http: angular.IHttpService,
            mapService: MapService,
            localStorageService: angular.local.storage.ILocalStorageService,
            drawingFactory: Drawing.DrawingFactory,
            hashService: HashService) {
            super(mapService);
            this.$http = $http;
            this.localStorageService = localStorageService
            this.hashService = hashService;
            this.drawingFactory = drawingFactory;
            this.selectedBaseLayer = null;
            this.baseLayers = [];
            this.overlays = [];
            this.routes = [];
            this.overlayZIndex = 10;
            this.eventHelper = new Common.EventHelper<Common.IDataChangedEventArgs>();
            
            var lastModified = (typeof getLastModifiedDate == "function") ? getLastModifiedDate() : (new Date(document.lastModified)).toDateString();
            lastModified = "Last update: " + lastModified;
            this.tileLayerOptions = <L.TileLayerOptions> {
                minZoom: 7,
                maxZoom: LayersService.MAX_ZOOM,
                maxNativeZoom: 16,
                attribution: LayersService.ATTRIBUTION + lastModified,
            };
            // default layers:
            this.addBaseLayer(LayersService.ISRAEL_HIKING_MAP, "http://{s}/IsraelHiking/Tiles/{z}/{x}/{y}.png", <L.TileLayerOptions> {
                minZoom: 7,
                maxZoom: LayersService.MAX_ZOOM,
                maxNativeZoom: 16,
                attribution: LayersService.ATTRIBUTION + lastModified,
                subdomains: ["tiles.trailze.com", "www.osm.org.il"]
            });
            this.addBaseLayer(LayersService.ISRAEL_MTB_MAP, "http://www.osm.org.il/IsraelHiking/mtbTiles/{z}/{x}/{y}.png", <L.TileLayerOptions> {
                minZoom: 7,
                maxZoom: LayersService.MAX_ZOOM,
                maxNativeZoom: 16,
                attribution: LayersService.MTB_ATTRIBUTION + lastModified,
            });
            this.baseLayers.push(<IBaseLayer> { key: LayersService.GOOGLE_EARTH, layer: <any>new L.Google(), selected: false });
            this.addOverlay(LayersService.HIKING_TRAILS,
                "http://www.osm.org.il/IsraelHiking/OverlayTiles/{z}/{x}/{y}.png",
                this.tileLayerOptions,
                false);

            this.addLayersFromLocalStorage();
            this.addDrawingsFromHash();

            this.selectBaseLayer(this.baseLayers[0]);
        }

        public addBaseLayer = (key: string, address: string, options: L.TileLayerOptions) => {
            if (_.find(this.baseLayers, (layerToFind) => layerToFind.key == key)) {
                return; // layer exists
            }
            if (options && !options.attribution) {
                options.attribution = this.tileLayerOptions.attribution;
            }

            var layer = <IBaseLayer>{ key: key, layer: L.tileLayer(address, options), selected: false };
            this.baseLayers.push(layer);
            this.selectBaseLayer(layer);
            var baseLayers = this.localStorageService.get<ILayerData[]>(LayersService.BASE_LAYERS_KEY) || [];
            baseLayers.push(<ILayerData>{ key: key, address: address, minZoom: options.minZoom, maxZoom: options.maxNativeZoom });
            this.localStorageService.set(LayersService.BASE_LAYERS_KEY, baseLayers);
        }

        public addOverlay = (key: string, address: string, options: L.TileLayerOptions, show = true) => {
            if (_.find(this.overlays, (overlayToFind) => overlayToFind.key == key)) {
                return; // overlay exists
            }
            if (options && !options.attribution) {
                options.attribution = this.tileLayerOptions.attribution;
            }
            var overlay = <IOvelay>{ key: key, layer: L.tileLayer(address, options), visible: false };
            overlay.layer.setZIndex(this.overlayZIndex++);
            this.overlays.push(overlay);
            if (show) {
                this.toggleOverlay(overlay);
            }
            var overlays = this.localStorageService.get<ILayerData[]>(LayersService.OVERLAYS_KEY) || [];
            overlays.push(<ILayerData>{ key: key, address: address, minZoom: options.minZoom, maxZoom: options.maxNativeZoom });
            this.localStorageService.set(LayersService.OVERLAYS_KEY, overlays);
        }

        public addRoute = (name: string, routeData: Common.RouteData, pathOptions: L.PathOptions) => {
            if (name == "") {
                name = this.createRouteName();
            }
            var route = this.getRouteByName(name);
            if (route != null && routeData != null) {
                route.setData(routeData);
                return;
            }
            routeData = routeData || <Common.RouteData> {
                segments: [],
                name: name,
            };
            var drawingRoute = this.drawingFactory.createDrawingRoute(routeData, false, pathOptions);
            this.routes.push(drawingRoute);
            this.changeDrawingState(drawingRoute.name);
        }

        public isNameAvailable = (name: string) => {
            var route = this.getRouteByName(name);
            return route == null;
        }

        public removeBaseLayer = (baseLayer: Services.IBaseLayer) => {
            var baseLayers = this.localStorageService.get<ILayerData[]>(LayersService.BASE_LAYERS_KEY);
            _.remove(baseLayers, (layerData) => layerData.key == baseLayer.key);
            this.localStorageService.set(LayersService.BASE_LAYERS_KEY, baseLayers);
            if (this.selectedBaseLayer.key != baseLayer.key) {
                _.remove(this.baseLayers, (layer) => baseLayer.key == layer.key);
                return;
            }
            var index = this.baseLayers.indexOf(this.selectedBaseLayer);
            index = (index + 1) % this.baseLayers.length;
            this.selectBaseLayer(this.baseLayers[index]);
            _.remove(this.baseLayers, (layer) => baseLayer.key == layer.key);
            if (this.baseLayers.length == 0) {
                this.map.removeLayer(baseLayer.layer);
                this.selectedBaseLayer = null;
            }
        }

        public removeOverlay = (overlay: IOvelay) => {
            var overlays = this.localStorageService.get<ILayerData[]>(LayersService.OVERLAYS_KEY);
            _.remove(overlays, (layerData) => layerData.key == overlay.key);
            this.localStorageService.set(LayersService.OVERLAYS_KEY, overlays);
            if (overlay.visible) {
                this.map.removeLayer(overlay.layer);
            }
            _.remove(this.overlays, (overlayToRemove) => overlayToRemove.key == overlay.key);
        }

        public removeRoute = (routeName: string) => {
            var route = this.getRouteByName(routeName);
            if (route == null) {
                return;
            }
            route.destroy();
            this.routes.splice(this.routes.indexOf(route), 1);
            this.hashService.removeRoute(routeName);
        }

        public selectBaseLayer = (baseLayer: Services.IBaseLayer) => {
            if (baseLayer.selected) {
                return;
            }
            if (this.selectedBaseLayer) {
                this.map.removeLayer(this.selectedBaseLayer.layer);
                this.selectedBaseLayer.selected = false;
            }
            var newSelectedLayer = _.find(this.baseLayers, (layer) => layer.key == baseLayer.key);
            this.map.addLayer(newSelectedLayer.layer, true);
            newSelectedLayer.selected = true;
            this.selectedBaseLayer = newSelectedLayer;
        }

        public toggleOverlay = (overlay: IOvelay) => {
            var overlayFromArray = _.find(this.overlays, (overlayToFind) => overlayToFind.key == overlay.key);
            overlayFromArray.visible = !overlayFromArray.visible;
            if (overlayFromArray.visible) {
                this.map.addLayer(overlay.layer);
            } else {
                this.map.removeLayer(overlay.layer);
            }
        }

        public changeDrawingState = (name: string) => {
            var drawing = <Drawing.IDrawing>this.getRouteByName(name);
            if (name == this.markers.name) {
                drawing = this.markers;
            }
            if (drawing == null) {
                return;
            }
            if (drawing == this.selectedDrawing) {
                if (drawing.state == Services.Drawing.DrawingState.active) {
                    this.selectedDrawing.hide();
                    return;
                }
                if (drawing.state == Services.Drawing.DrawingState.hidden) {
                    this.selectedDrawing.show();
                    return;
                }
            }

            if (this.selectedDrawing && this.selectedDrawing.state != Services.Drawing.DrawingState.hidden) {
                this.selectedDrawing.deactivate();
            }
            this.selectedDrawing = drawing;
            this.selectedDrawing.activate();
            this.eventHelper.raiseEvent(<Common.IDataChangedEventArgs>{});
        }

        public createRouteName = () => {
            var index = 1;
            var routeName = "Route " + index;
            while (_.any(this.routes, (route) => route.name == routeName)) {
                index++;
                routeName = "Route " + index;
            }
            return routeName;
        }

        private addLayersFromLocalStorage = () => {
            var baseLayers = this.localStorageService.get<ILayerData[]>(LayersService.BASE_LAYERS_KEY) || [];
            for (var baseLayerIndex = 0; baseLayerIndex < baseLayers.length; baseLayerIndex++) {
                var baseLayerData = baseLayers[baseLayerIndex];
                this.addBaseLayer(baseLayerData.key, baseLayerData.address, <L.TileLayerOptions> { minZoom: baseLayerData.minZoom, maxZoom: baseLayerData.maxZoom });
            }

            var overlays = this.localStorageService.get<ILayerData[]>(LayersService.OVERLAYS_KEY) || [];
            for (var overlayIndex = 0; overlayIndex < overlays.length; overlayIndex++) {
                var overlayData = overlays[overlayIndex];
                this.addOverlay(overlayData.key, overlayData.address,
                    <L.TileLayerOptions> { minZoom: overlayData.minZoom, maxZoom: overlayData.maxZoom },
                    false);
            }
        }

        private addDrawingsFromHash = () => {

            var dataContainer = this.hashService.getDataContainer();
            if (dataContainer.routes.length == 0) {
                dataContainer.routes.push(<Common.RouteData> {
                    name: this.createRouteName(),
                    segments: []
                });
            }
            for (var routeIndex = 0; routeIndex < dataContainer.routes.length; routeIndex++) {
                this.routes.push(this.drawingFactory.createDrawingRoute(dataContainer.routes[routeIndex], true, null));
            }
            this.markers = this.drawingFactory.createDrawingMarker(dataContainer.markers);
            this.markers.deactivate();
            this.changeDrawingState((this.routes.length > 0) ? this.routes[0].name : this.markers.name);
        }

        public getSelectedDrawing = (): Drawing.IDrawing => {
            return this.selectedDrawing;
        }

        public addMarkers = (markers: Common.MarkerData[]) => {
            this.markers.addMarkers(markers);
        }

        public getRouteByName = (routeName: string): Drawing.DrawingRoute => {
            return _.find(this.routes, (drawingToFind) => drawingToFind.name == routeName);
        }

        public createPathOptions = () => {
            return this.drawingFactory.createPathOptions();
        }
    }
}