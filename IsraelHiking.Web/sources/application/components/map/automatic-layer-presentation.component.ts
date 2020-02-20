import { Component, Input, OnInit, OnChanges, SimpleChanges, OnDestroy } from "@angular/core";
import { MapComponent } from "ngx-mapbox-gl";
import { RasterSource, RasterLayout, Layer, Style } from "mapbox-gl";
import { Subscription } from "rxjs";

import { ResourcesService } from "../../services/resources.service";
import { FileService } from "../../services/file.service";
import { BaseMapComponent } from "../base-map.component";

@Component({
    selector: "auto-layer",
    templateUrl: "./automatic-layer-presentation.component.html"
})
export class AutomaticLayerPresentationComponent extends BaseMapComponent implements OnInit, OnChanges, OnDestroy {
    private static indexNumber = 0;

    @Input()
    public address: string;
    @Input()
    public minZoom: number;
    @Input()
    public maxZoom: number;
    @Input()
    public opacity: number;
    @Input()
    public visible: boolean;
    @Input()
    public before: string;
    @Input()
    public isBaselayer: string;

    private rasterSourceId;
    private rasterLayerId;
    private sourceAdded: boolean;
    private subscriptions: Subscription[];
    private jsonSourcesIds: string[];
    private jsonLayersIds: string[];

    constructor(resources: ResourcesService,
                private readonly host: MapComponent,
                private readonly fileService: FileService) {
        super(resources);
        let layerIndex = AutomaticLayerPresentationComponent.indexNumber++;
        this.rasterLayerId = `raster-layer-${layerIndex}`;
        this.rasterSourceId = `raster-source-${layerIndex}`;
        this.sourceAdded = false;
        this.jsonSourcesIds = [];
        this.jsonLayersIds = [];
        this.subscriptions = [];
    }

    public ngOnInit() {
        if (this.host.mapInstance == null) {
            this.subscriptions.push(this.host.load.subscribe(() => {
                this.createLayer();
                this.sourceAdded = true;
            }));
        } else {
            this.createLayer();
            this.sourceAdded = true;
        }
        this.subscriptions.push(this.resources.languageChanged.subscribe(() => {
            if (this.sourceAdded) {
                this.removeLayer(this.address);
                this.createLayer();
            }
        }));
    }

    public ngOnDestroy() {
        for (let subscription of this.subscriptions) {
            subscription.unsubscribe();
        }
        if (this.sourceAdded) {
            this.removeLayer(this.address);
            this.sourceAdded = false;
        }
    }

    async ngOnChanges(changes: SimpleChanges) {
        if (this.sourceAdded) {
            await this.removeLayer(changes.address.previousValue);
            this.createLayer();
        }
    }

    private isRaster(address: string) {
        return !address.endsWith("json");
    }

    private createRasterLayer() {
        let address = this.address;
        let scheme = "xyz";
        if (this.address.toLocaleLowerCase().endsWith("/mapserver")) {
            address += "/export?dpi=96&transparent=true&format=png32&bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&f=image";
        } else if (this.address.indexOf("{-y}") !== -1) {
            address = address.replace("{-y}", "{y}");
            scheme = "tms";
        }
        let source = {
            type: "raster",
            tiles: [address],
            minzoom: Math.max(this.minZoom - 1, 0),
            maxzoom: this.maxZoom,
            scheme,
            tileSize: 256,
            attribution: "<a href='https://github.com/IsraelHikingMap/Site/wiki/Attribution' target='_blank'>" +
                "Click me to see attribution</a>"
        } as RasterSource;
        this.host.mapInstance.addSource(this.rasterSourceId, source);
        let layer = {
            id: this.rasterLayerId,
            type: "raster",
            source: this.rasterSourceId,
            layout: {
                visibility: (this.visible ? "visible" : "none") as "visible" | "none"
            } as RasterLayout,
            paint: {
                "raster-opacity": this.opacity || 1.0
            }
        } as Layer;
        this.host.mapInstance.addLayer(layer, this.before);
    }

    private removeRasterLayer() {
        this.host.mapInstance.removeLayer(this.rasterLayerId);
        this.host.mapInstance.removeSource(this.rasterSourceId);
    }

    private async createJsonLayer() {
        let response = await this.fileService.getStyleJsonContent(this.address);
        let language = this.resources.getCurrentLanguageCodeSimplified();
        let styleJson = JSON.parse(JSON.stringify(response).replace(/name_he/g, `name_${language}`)) as Style;
        let sources = styleJson.sources;
        let layers = styleJson.layers;
        let currentStyle = this.host.mapInstance.getStyle();
        styleJson.sources = currentStyle.sources;
        styleJson.layers = currentStyle.layers;
        styleJson.glyphs = this.fileService.getDataUrl(styleJson.glyphs);
        styleJson.sprite = this.fileService.getDataUrl(styleJson.sprite);
        this.host.mapInstance.setStyle(styleJson);
        if (this.host.mapInstance.isStyleLoaded()) {
            this.updateSourcesAndLayers(sources, layers);
        } else {
            this.host.mapInstance.once("style.load", () => {
                this.updateSourcesAndLayers(sources, layers);
            });
        }
    }

    private updateSourcesAndLayers(sources: {}, layers: Layer[]) {
        for (let source in sources) {
            if (sources.hasOwnProperty(source)) {
                this.jsonSourcesIds.push(source);
                this.host.mapInstance.addSource(source, sources[source]);
            }
        }
        for (let layer of layers) {
            this.jsonLayersIds.push(layer.id);
            this.host.mapInstance.addLayer(layer, this.before);
        }
    }

    private removeJsonLayer() {
        for (let layerId of this.jsonLayersIds) {
            this.host.mapInstance.removeLayer(layerId);
        }
        this.jsonLayersIds = [];
        for (let sourceId of this.jsonSourcesIds) {
            this.host.mapInstance.removeSource(sourceId);
        }
        this.jsonSourcesIds = [];
    }

    private async createLayer() {
        if (this.isRaster(this.address)) {
            this.createRasterLayer();
        } else {
            await this.createJsonLayer();
        }
        if (this.isBaselayer) {
            this.host.mapInstance.setMinZoom(this.minZoom - 1);
        }
    }

    private async removeLayer(address) {
        if (this.isRaster(address)) {
            this.removeRasterLayer();
        } else {
            await this.removeJsonLayer();
        }
    }
}
