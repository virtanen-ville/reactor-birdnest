import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

import { Buffer } from "buffer";
import EventEmitter from "events";
import process from "process";

// sax.js in xml2js needs these
window.Buffer = Buffer;
window.EventEmitter = EventEmitter;
window.process = process;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>
);
