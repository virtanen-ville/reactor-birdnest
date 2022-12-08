export {};

declare global {
	interface Window {
		EventEmitter: any;
		timers: any;
	}
}
