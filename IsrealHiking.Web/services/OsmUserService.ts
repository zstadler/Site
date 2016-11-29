﻿declare var osmAuth: Function;

namespace IsraelHiking.Services {

    interface IOsmAuthService {
        authenticated(): boolean;
        xhr(options: Object, callback: Function);
        logout(): void;
    }

    export interface ITrace {
        fileName: string;
        description: string;
        url: string;
        imageUrl: string;
        dataUrl: string;
        id: string;
    }

    export class OsmUserService {
        public static AUTHORIZATION_DATA_KEY = "osmAuthorizationToken";

        private static BASE_URL = "https://www.openstreetmap.org";

        private oauth;
        private x2Js: IX2JS;
        private $q: angular.IQService;
        private $http: angular.IHttpService;
        private localStorageService: angular.local.storage.ILocalStorageService;

        public displayName: string;
        public imageUrl: string;
        public changeSets: number;
        public traces: ITrace[];
        public shares: Common.SiteUrl[];
        public userId: string;

        constructor($q: angular.IQService,
            $http: angular.IHttpService,
            localStorageService: angular.local.storage.ILocalStorageService) {
            this.$q = $q;
            this.$http = $http;
            this.localStorageService = localStorageService;

            this.oauth = osmAuth({
                oauth_consumer_key: "H5Us9nv9eDyFpKbBTiURf7ZqfdBArNddv10n6R6U",
                oauth_secret: "ccYaQUKLz26XEzbNd8uWoQ6HwbcnrUUp8milXnXG",
                auto: true, // show a login form if the user is not authenticated and you try to do a call
                landing: "controllers/oauth-close-window.html",
                url: OsmUserService.BASE_URL
            }) as IOsmAuthService;
            if (this.isLoggedIn()) {
                this.refreshDetails();
            }
            this.x2Js = new X2JS();
            this.traces = [];
            this.shares = [];
        }

        public logout = () => {
            this.oauth.logout();
        }

        public isLoggedIn = (): boolean => {
            return this.oauth.authenticated() && (this.localStorageService.get(OsmUserService.AUTHORIZATION_DATA_KEY) != null);
        }

        public login = (): angular.IPromise<{}> => {
            return this.refreshDetails();
        }

        public getSiteUrlPostfix(id: string) {
            return `/#!/?s=${id}`;
        }

        public refreshDetails = (): angular.IPromise<{}> => {
            let deferred = this.$q.defer();
            var sharesPromise = null;
            this.oauth.xhr({
                method: "GET",
                path: "/api/0.6/user/details"
            }, (detailsError, details) => {
                if (detailsError) {
                    deferred.reject(detailsError);
                    return;
                }
                let authToken = localStorage.getItem(`${OsmUserService.BASE_URL}oauth_token`); // using native storage since it is saved with ohauth
                let authTokenSecret = localStorage.getItem(`${OsmUserService.BASE_URL}oauth_token_secret`);
                this.localStorageService.set(OsmUserService.AUTHORIZATION_DATA_KEY, authToken + ";" + authTokenSecret);
                let detailJson = this.x2Js.xml2json(details) as any;
                this.displayName = detailJson.osm.user._display_name;
                if (detailJson.osm.user.img && detailJson.osm.user.img._href) {
                    this.imageUrl = detailJson.osm.user.img._href;
                }
                this.changeSets = detailJson.osm.user.changesets._count;
                this.userId = detailJson.osm.user._id;
                this.oauth.xhr({
                    method: "GET",
                    path: "/api/0.6/user/gpx_files"
                }, (tracesError, traces) => {
                    if (tracesError) {
                        deferred.reject(tracesError);
                        return;
                    }
                    let tracesJson = this.x2Js.xml2json(traces) as any;
                    this.traces = [];
                    for (let traceJson of tracesJson.osm.gpx_file) {
                        let baseOsm = "https://www.openstreetmap.org/";
                        let id = traceJson._id;
                        let url = `${baseOsm}user/${traceJson._user}/traces/${id}`;
                        let dataUrl = `${baseOsm}api/0.6/gpx/${id}/data`;
                        this.traces.push({
                            fileName: traceJson._name,
                            description: traceJson.description,
                            url: url,
                            imageUrl: url + "/picture",
                            dataUrl: dataUrl,
                            id: id
                        });
                    }
                    deferred.resolve();
                });
                sharesPromise = this.$http.get(Common.Urls.urls).then((response: { data: Common.SiteUrl[] }) => {
                    this.shares = response.data;
                });
            });
            return this.$q.all([deferred.promise, this.$q.when(sharesPromise)]);
        }

        public updateSiteUrl = (siteUrl: Common.SiteUrl): angular.IPromise<{}> => {
            return this.$http.put(Common.Urls.urls + siteUrl.Id, siteUrl);
        }

        public deleteSiteUrl = (siteUrl: Common.SiteUrl): angular.IPromise<void> => {
            return this.$http.delete(Common.Urls.urls + siteUrl.Id).then(() => {
                _.remove(this.shares, s => s.Id === siteUrl.Id);
            });
        }

        public getImageFromSiteUrlId = (siteUrl: Common.SiteUrl) => {
            return Common.Urls.images + siteUrl.Id;
        }

        public getUrlFromSiteUrlId = (siteUrl: Common.SiteUrl) => {
            return Common.Urls.baseAddress + this.getSiteUrlPostfix(siteUrl.Id);
        }

        public getMissingParts(trace: ITrace): angular.IHttpPromise<{}> {
            return this.$http.post(Common.Urls.osm + "?url=" + trace.dataUrl, {});
        }

        public getEditOsmLocationAddress(baseLayerAddress: string, zoom: number, center: L.LatLng): string {
            let background = this.getBackgroundStringForOsmAddress(baseLayerAddress);
            return `${OsmUserService.BASE_URL}/edit#${background}&map=${zoom}/${center.lat}/${center.lng}`;
        }

        public getEditOsmGpxAddress(baseLayerAddress: string, gpxId: string) {
            let background = this.getBackgroundStringForOsmAddress(baseLayerAddress);
            return `${OsmUserService.BASE_URL}/edit?gpx=${gpxId}#${background}`;
        }

        private getBackgroundStringForOsmAddress(baseLayerAddress: string): string {
            let background = "background=bing";
            if (baseLayerAddress !== "") {
                if (baseLayerAddress.indexOf("/") === 0) {
                    baseLayerAddress = Common.Urls.baseAddress + baseLayerAddress;
                }
                let address = baseLayerAddress.indexOf("{s}") === -1 ? baseLayerAddress : Common.Urls.baseAddress + Services.Layers.LayersService.DEFAULT_TILES_ADDRESS;
                background = `background=custom:${address}`;
            }
            return background;
        }
    }
}