export type ExtensionProtocol = 'chrome-extension' | 'moz-extension';

export function extensionOptionsUrl(protocol: ExtensionProtocol, extensionId: string): string {
  return `${protocol}://${extensionId}/options.html`;
}
