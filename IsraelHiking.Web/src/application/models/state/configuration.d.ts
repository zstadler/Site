﻿import { Language } from "../language";

export type Configuration = {
    isBatteryOptimization: boolean;
    isAutomaticRecordingUpload: boolean;
    //isFindMissingRoutesAfterUpload: boolean;
    isGotLostWarnings: boolean;
    isShowBatteryConfirmation: boolean;
    isShowIntro: boolean;
    version: string;
    language: Language;
}
