declare module 'firebase/app' {
  export function initializeApp(config: any): any;
}

declare module 'firebase/firestore' {
  export function getFirestore(app?: any): any;
  export function doc(...args: any[]): any;
  export function setDoc(...args: any[]): Promise<any>;
  export function addDoc(...args: any[]): Promise<any>;
  export function collection(...args: any[]): any;
  export function getDocs(...args: any[]): Promise<any>;
  export function updateDoc(...args: any[]): Promise<any>;
}

declare module 'firebase/storage' {
  export function getStorage(app?: any): any;
}

declare module 'socket.io' {
  export const Server: any;
}
