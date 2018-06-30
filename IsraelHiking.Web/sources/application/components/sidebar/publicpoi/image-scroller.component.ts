﻿import { Component, Input, Output, EventEmitter } from "@angular/core";

import { BaseMapComponent } from "../../base-map.component";
import { ResourcesService } from "../../../services/resources.service";
import { FileService } from "../../../services/file.service";
import { ImageGalleryService } from "../../../services/image-gallery.service";

@Component({
    selector: "image-scroller",
    templateUrl: "./image-scroller.component.html"
})
export class ImageScrollerComponent extends BaseMapComponent {
    private currentIndex: number;

    @Input()
    public images: string[];

    @Input()
    public canEdit: boolean;

    @Output()
    public currentImageChanged: EventEmitter<string>;

    constructor(resources: ResourcesService,
        private readonly fileService: FileService,
        private readonly imageGalleryService: ImageGalleryService) {
        super(resources);
        this.currentIndex = 0;
        this.currentImageChanged = new EventEmitter();
    }

    public next() {
        this.currentIndex++;
        if (this.currentIndex >= this.images.length) {
            this.currentIndex = this.images.length - 1;
        }
        this.currentImageChanged.next(this.getCurrentValue());
    }

    public previous() {
        this.currentIndex--;
        if (this.currentIndex < 0) {
            this.currentIndex = 0;
        }
        this.currentImageChanged.next(this.getCurrentValue());
    }

    public hasNext(): boolean {
        return this.currentIndex < this.images.length - 1;
    }

    public hasPrevious(): boolean {
        return this.currentIndex > 0;
    }

    public remove(): void {
        this.images.splice(this.currentIndex, 1);
        this.previous();
    }

    public add(e: any) {
        let files = this.fileService.getFilesFromEvent(e);
        for (let file of files) {
            let reader = new FileReader();

            reader.onload = (event: any) => {
                this.images.push(event.target.result);
                this.currentIndex = this.images.length - 1;
                this.currentImageChanged.next(this.getCurrentValue());
            };

            reader.readAsDataURL(file);
        }
    }

    public getCurrentValue(): string {
        if (this.images.length === 0) {
            return null;
        }
        return this.images[this.currentIndex];
    }

    private getCurrentImage() {
        let imageUrl = this.getCurrentValue();
        if (imageUrl == null) {
            return null;
        }
        return this.resources.getResizedImageUrl(imageUrl, 800);
    }

    public showImage() {
        let imagesUrls = [];
        for (let imageUrl of this.images) {
            imagesUrls.push(this.resources.getResizedImageUrl(imageUrl, 1600));
        }
        this.imageGalleryService.setImages(imagesUrls);
    }
}