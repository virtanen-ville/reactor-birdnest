declare module "cors-anywhere" {
	import http from "http";

	export function createServer(options: {
		originWhitelist: string[];
		requireHeaders: string[];
		removeHeaders: string[];
		// corsMaxAge: number;
		// httpProxyOptions: {
		// 	xfwd: boolean;
		// };
	}): http.Server;
}
