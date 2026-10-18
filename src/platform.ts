const platform = window.formaDesktop?.platform ?? navigator.platform;
export const isMac = platform === 'darwin' || /Mac/i.test(platform);
export const commandKey = isMac ? '⌘' : 'Ctrl';
export const shortcut = (keys: string) => `${commandKey}+${keys}`;
