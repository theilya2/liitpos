/** A short tap. Web and desktops have no vibrator, so a failure is ignored. */
export function tapKey(): void {
  void import("@capacitor/haptics")
    .then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light }))
    .catch(() => undefined);
}
