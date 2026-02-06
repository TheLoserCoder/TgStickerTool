export interface ElectronAPI {
  send: (channel: string, data: any) => void;
  on: (channel: string, callback: (data: any) => void) => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
