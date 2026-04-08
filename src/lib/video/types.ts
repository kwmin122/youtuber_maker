// Video assembly types

/** Subtitle style configuration */
export interface SubtitleStyle {
  fontFamily: string;
  fontSize: number;        // px
  fontColor: string;       // hex
  backgroundColor: string; // hex with alpha or 'transparent'
  borderColor: string;     // hex
  borderWidth: number;     // px
  shadowColor: string;     // hex
  shadowOffset: number;    // px
  position: "top" | "center" | "bottom";
}

/** Default subtitle style applied when user hasn't customized */
export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontFamily: "Noto Sans KR",
  fontSize: 36,
  fontColor: "#FFFFFF",
  backgroundColor: "#00000080",
  borderColor: "#000000",
  borderWidth: 2,
  shadowColor: "#00000080",
  shadowOffset: 2,
  position: "bottom",
};

/** Available transition types */
export type TransitionType =
  | "fade"
  | "dissolve"
  | "slide-left"
  | "slide-right"
  | "zoom-in"
  | "cut";

export const TRANSITION_TYPES: TransitionType[] = [
  "fade",
  "dissolve",
  "slide-left",
  "slide-right",
  "zoom-in",
  "cut",
];

/** Audio track type */
export type AudioTrackType = "bgm" | "sfx";

/** Scene data for export pipeline */
export interface ExportScene {
  sceneIndex: number;
  narration: string;
  duration: number;         // seconds
  mediaUrl: string;         // image or video URL
  mediaType: "image" | "video";
  audioUrl?: string;        // TTS audio URL
  subtitleStyle: SubtitleStyle | null;
  transitionType: TransitionType;
  transitionDuration: number; // seconds
}

/** Audio track data for export pipeline */
export interface ExportAudioTrack {
  url: string;
  type: AudioTrackType;
  startTime: number;
  endTime: number | null;
  volume: number;
}

/** Full export request data */
export interface ExportRequest {
  projectId: string;
  scenes: ExportScene[];
  audioTracks: ExportAudioTrack[];
  outputWidth: number;      // 1080
  outputHeight: number;     // 1920
  fps: number;              // 30
}

/** Export progress data sent via Realtime */
export interface ExportProgress {
  phase: "downloading" | "rendering" | "uploading" | "complete";
  percent: number; // 0-100
  currentScene?: number;
  totalScenes?: number;
  message?: string;
}

/** FFmpeg filter graph configuration for a single scene */
export interface SceneFilterConfig {
  inputIndex: number;
  duration: number;
  hasSubtitle: boolean;
  subtitleText?: string;
  subtitleStyle?: SubtitleStyle;
  transitionType: TransitionType;
  transitionDuration: number;
}

/** Royalty-free audio library entry */
export interface AudioLibraryEntry {
  id: string;
  name: string;
  type: AudioTrackType;
  url: string;             // bundled static file or CDN URL
  duration: number;        // seconds
  category: string;        // 'lo-fi' | 'upbeat' | 'dramatic' | 'calm' | 'whoosh' | 'pop' | 'ding'
}
