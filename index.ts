import path from "path";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import xml2js from "xml2js";
import { Server } from "socket.io";
import { createServer } from "http";
import {
	ServerToClientEvents,
	ClientToServerEvents,
	InterServerEvents,
	SocketData,
	Drone,
	Coordinates,
} from "./types/types";
const fetch = require("node-fetch");
const parser = new xml2js.Parser();
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
app.use(cors({ origin: ["http://127.0.0.1:5173", "http://localhost:5173"] }));
//app.use(cors());

/* 
Keep the drone information in this variable. 
We change it with interval in getDrones() function.
And we send it to the client witch socket.
(or as a response to requests to /drones endpoint)  
*/
let drones: Drone[] = [];

// Proxy server for CORS. This allows us to fetch data from the Reaktor API without having to deal with CORS.
const proxy = require("cors-anywhere").createServer({
	originWhitelist: [], // Allow all origins
	requireHeaders: [], // Do not require any headers.
	removeHeaders: [], // Do not remove any headers.
});

// Attach our cors proxy to the existing API on the /proxy endpoint. This is needed because the API doesn't have CORS headers.
app.get("/proxy/:proxyUrl*", (req, res) => {
	req.url = req.url.replace("/proxy/", "/"); // Strip '/proxy' from the front of the URL, else the proxy won't work.
	proxy.emit("request", req, res);
});

app.get("/drones", function (req, res) {
	res.send(drones);
});

app.get("/test", function (req, res) {
	res.send({ message: "Hello World!" });
});

app.use(express.static(path.resolve(__dirname, "dist")));

app.get("/", function (req, res) {
	res.sendFile(path.join(__dirname, "dist", "index.html"));
});

const httpServer = createServer(app);
const io = new Server<
	ClientToServerEvents,
	ServerToClientEvents,
	InterServerEvents,
	SocketData
>(httpServer, {
	cors: {
		origin: [
			"http://127.0.0.1:5173",
			"http://localhost:5173",
			"ws://localhost:5173",
		],
	},
});

const distanceFromCenter = (coordinates: Coordinates) => {
	const center: Coordinates = { x: 250000, y: 250000 };
	const distance = Math.sqrt(
		Math.pow(coordinates.x - center.x, 2) +
			Math.pow(coordinates.y - center.y, 2)
	);
	return distance / 1000;
};

const isOlderThan10Minutes = (timestamp: string) => {
	const now = new Date();
	const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
	const droneTimestamp = new Date(timestamp);
	return droneTimestamp < tenMinutesAgo;
};
const getDrones = async (oldDroneList: Drone[]) => {
	try {
		const res = await fetch(
			`${process.env.HOST}/proxy/http://assignments.reaktor.com/birdnest/drones`,
			// "http://127.0.0.1:3000/proxy/http://assignments.reaktor.com/birdnest/drones",
			{
				method: "GET",
			}
		);
		// res is XML. Parse it.
		const xml = await res.text();
		const result = await parser.parseStringPromise(xml);

		// Add required information to each drone
		const newDrones: Drone[] = await result.report.capture[0].drone.map(
			(drone: any) => {
				return {
					serialNumber: drone.serialNumber[0],
					model: drone.model[0],
					manufacturer: drone.manufacturer[0],
					positionX: parseFloat(drone.positionX[0]),
					positionY: parseFloat(drone.positionY[0]),
					altitude: parseFloat(drone.altitude[0]),
					timestamp: new Date(
						result.report.capture[0]["$"].snapshotTimestamp
					),
					NDZtimestamp:
						distanceFromCenter({
							x: parseFloat(drone.positionX[0]),
							y: parseFloat(drone.positionY[0]),
						}) <= 100
							? new Date(
									result.report.capture[0][
										"$"
									].snapshotTimestamp
							  )
							: null,
					distance: distanceFromCenter({
						x: parseFloat(drone.positionX[0]),
						y: parseFloat(drone.positionY[0]),
					}),
				};
			}
		);

		// Array of drones that are within 100m from the center and are not in the old list
		const newViolations = newDrones.filter(
			(drone) =>
				drone.distance <= 100 &&
				!oldDroneList.find(
					(oldDrone) => oldDrone.serialNumber === drone.serialNumber
				)
		);

		// Get the owner information for each new drone
		const newViolationsWithOwners = await Promise.all(
			newViolations.map(async (drone) => {
				const owner = await fetch(
					`${process.env.HOST}/proxy/http://assignments.reaktor.com/birdnest/pilots/${drone.serialNumber}`
					// `http://127.0.0.1:3000/proxy/http://assignments.reaktor.com/birdnest/pilots/${drone.serialNumber}`
				);
				const ownerJson = await owner.json();
				return {
					...drone,
					owner: ownerJson,
				};
			})
		);

		// Array of drones that were in the old list, but updated with new information. You could use flatMap here if you wanted to filter the older than 10 min ones at the same time.
		const updatedOldDroneList = oldDroneList.map((oldDrone) => {
			const newDrone = newDrones.find(
				(newDrone) => newDrone.serialNumber === oldDrone.serialNumber
			);
			if (newDrone) {
				return {
					...oldDrone,
					timestamp: newDrone.timestamp, // Update timestamp
					NDZtimestamp:
						newDrone.NDZtimestamp || oldDrone.NDZtimestamp, // Update NDZtimestamp if drone is within 100m from the center
					distance: Math.min(newDrone.distance, oldDrone.distance), // Keep the smallest distanc
				};
			} else {
				return oldDrone;
			}
		});

		// Put the arrays together and filter out drones that are older than 10 minutes
		const finalDroneList = [
			...updatedOldDroneList,
			...newViolationsWithOwners,
		].filter((drone) => !isOlderThan10Minutes(drone.timestamp));

		console.log(
			"🚀 ~ file: index.ts:141 ~ finalDroneList ~ finalDroneList",
			finalDroneList
		);
		return finalDroneList;
	} catch (error) {
		console.log(error);
	}
};

// This interval will update the drone list every x seconds and it will keep the list updated so that we can send it to the client anytime
const interval = setInterval(async () => {
	const droneList = await getDrones(drones); // Get the drones (send the old drones as a parameter)
	if (droneList) drones = droneList; // If we get a new drone list, update the old one
}, 1000 * 10); // TODO change to 2 seconds

io.on("connection", (socket) => {
	console.log(`Client ${String(socket.id)} connected`);
	socket.emit("getData", drones);

	const socketInterval = setInterval(() => {
		socket.emit("getData", drones);
	}, 1000 * 10); // TODO change to 2 seconds

	socket.on("getData", () => {
		socket.emit("getData", drones);
	});

	socket.on("disconnect", async (reason) => {
		console.log(`Client ${String(socket.id)} disconnected: ${reason}`);
		clearInterval(socketInterval);
	});
});

httpServer.listen(process.env.PORT || 3000, () => {
	console.log(`Server started on port ${process.env.PORT}`);
});
