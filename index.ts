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
app.use(cors({ origin: "http://127.0.0.1:5173" }));
//app.use(cors({ origin: "http://localhost:5173" }));
//app.use(cors());

const proxy = require("cors-anywhere").createServer({
	originWhitelist: [], // Allow all origins
	requireHeaders: [], // Do not require any headers.
	removeHeaders: [], // Do not remove any headers.
});
let drones: Drone[] = [];
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
			"http://127.0.0.1:3000/proxy/http://assignments.reaktor.com/birdnest/drones",
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

		let newDroneList: Drone[] = [...oldDroneList];
		console.log(
			"🚀 ~ file: index.ts:94 ~ getDrones ~ newDroneList",
			newDroneList
		);

		// newDrones.forEach(async (newDrone) =>
		// Go over the new list of drones
		for await (const newDrone of newDrones) {
			// Check if drone is already in the list
			const existingDrone = oldDroneList.find(
				(oldDrone) => oldDrone.serialNumber === newDrone.serialNumber
			);
			// If drone is not on the list and it's within 100m from the center add it to the list
			if (!existingDrone && newDrone.distance <= 100) {
				const owner = await fetch(
					`http://127.0.0.1:3000/proxy/http://assignments.reaktor.com/birdnest/pilots/${newDrone.serialNumber}`
				);
				const ownerJson = await owner.json();
				const newDroneWithOwner = { ...newDrone, owner: ownerJson };
				newDroneList.push(newDroneWithOwner);
			}
			// If drone is in the list update the timestamp and distance
			else if (existingDrone) {
				const updatedDrone = {
					...existingDrone,
					timestamp: newDrone.timestamp, // Update timestamp
					NDZtimestamp:
						newDrone.NDZtimestamp || existingDrone.NDZtimestamp, // Update NDZtimestamp if drone is within 100m from the center
					distance: Math.min(
						newDrone.distance,
						existingDrone.distance
					), // Keep the smallest distance
				};

				// Replace the drone in the list with the updated drone
				const indexOfDrone = newDroneList.findIndex(
					(drone) => drone.serialNumber === updatedDrone.serialNumber
				);
				newDroneList.splice(indexOfDrone, 1, updatedDrone);
			}
		}

		// Finally filter drones that are older than 10 minutes
		const finalDroneList = newDroneList.filter((drone) => {
			return !isOlderThan10Minutes(drone.timestamp);
		});
		console.log(
			"🚀 ~ file: index.ts:134 ~ finalDroneList ~ finalDroneList",
			finalDroneList
		);
		return finalDroneList;
	} catch (error) {
		console.log(error);
	}
};

/* Attach our cors proxy to the existing API on the /proxy endpoint. */
app.get("/proxy/:proxyUrl*", (req, res) => {
	req.url = req.url.replace("/proxy/", "/"); // Strip '/proxy' from the front of the URL, else the proxy won't work.
	proxy.emit("request", req, res);
});

app.get("/drones", function (req, res) {
	res.send(drones);
});

app.use(express.static(path.resolve(__dirname, "build")));

app.get("/", function (req, res) {
	res.sendFile(path.join(__dirname, "build", "index.html"));
});

const httpServer = createServer(app);
const io = new Server<
	ClientToServerEvents,
	ServerToClientEvents,
	InterServerEvents,
	SocketData
>(httpServer, {
	cors: {
		origin: "http://127.0.0.1:5173",
	},
});

// This interval will update the drone list every x seconds and it will keep the list updated so that wwe can send it to the client anytime
const interval = setInterval(async () => {
	const droneList = await getDrones(drones);
	if (droneList) drones = droneList;
	// TODO change to 2 seconds
}, 1000 * 10);

io.on("connection", (socket) => {
	console.log(`Client ${String(socket.id)} connected`);
	socket.emit("getData", drones);

	const socketInterval = setInterval(() => {
		socket.emit("getData", drones);
		// TODO change to 2 seconds
	}, 1000 * 10);

	socket.on("getData", () => {
		console.log("getting data");
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
