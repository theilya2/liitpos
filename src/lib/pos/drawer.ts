const PULSE = new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa]);

type UsbDeviceLike = {
  open: () => Promise<void>;
  configuration: { interfaces: { interfaceNumber: number; alternate: { endpoints: { direction: string; endpointNumber: number }[] } }[] } | null;
  selectConfiguration: (n: number) => Promise<void>;
  claimInterface: (n: number) => Promise<void>;
  transferOut: (endpoint: number, data: BufferSource) => Promise<unknown>;
};

type UsbLike = {
  getDevices: () => Promise<UsbDeviceLike[]>;
  requestDevice: (options: { filters: { classCode?: number }[] }) => Promise<UsbDeviceLike>;
};

export async function pulseCashDrawer(): Promise<"sent" | "unavailable"> {
  const usb = (navigator as Navigator & { usb?: UsbLike }).usb;
  if (!usb) return "unavailable";
  try {
    let device = (await usb.getDevices())[0];
    if (!device) device = await usb.requestDevice({ filters: [{ classCode: 7 }] });
    await device.open();
    if (!device.configuration) await device.selectConfiguration(1);
    const iface = device.configuration?.interfaces[0];
    const endpoint = iface?.alternate.endpoints.find((item) => item.direction === "out");
    if (!iface || !endpoint) return "unavailable";
    await device.claimInterface(iface.interfaceNumber);
    await device.transferOut(endpoint.endpointNumber, PULSE);
    return "sent";
  } catch {
    return "unavailable";
  }
}
