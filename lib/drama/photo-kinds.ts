/** The three photos a cast member sends (shared by the server and the join page). */
export type PhotoKind = "face" | "angle" | "body";
export const PHOTO_KINDS: { kind: PhotoKind; label: string; hint: string }[] = [
  { kind: "face", label: "Your face, straight on", hint: "Look into the camera, good light, nothing covering your face" },
  { kind: "angle", label: "Your face, turned a little", hint: "Turn your head a little to one side" },
  { kind: "body", label: "Your whole body", hint: "Standing, head to feet in the photo" },
];
