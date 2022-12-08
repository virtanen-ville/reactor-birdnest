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

const parser = new xml2js.Parser();
const fetch = require("node-fetch");
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
const getData = async () => {
	const res = await fetch(
		"http://127.0.0.1:3000/proxy/http://assignments.reaktor.com/birdnest/drones",
		{
			method: "GET",
		}
	);
	// res is XML. Parse it.
	const xml = await res.text();
	parser
		.parseStringPromise(xml)
		.then(function (result) {
			// Add timestamp and distance to each drone
			const newDrones: Drone[] = result.report.capture[0].drone.map(
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

			// Go over the new list of drones
			newDrones.forEach(async (newDrone) => {
				// Check if drone is already in the list
				const existingDrone = drones.find(
					(oldDrone) =>
						oldDrone.serialNumber === newDrone.serialNumber
				);
				// If drone is not in the list and it's within 100m from the center
				if (!existingDrone && newDrone.distance <= 100) {
					// TODO Check the owner of the drone
					const owner = await fetch(
						`http://127.0.0.1:3000/proxy/http://assignments.reaktor.com/birdnest/pilots/${newDrone.serialNumber}`
					);
					const ownerJson = await owner.json();
					newDrone.owner = ownerJson;
					// Add the drone to the list
					drones.push(newDrone);
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
					drones = drones.map((oldDrone) =>
						oldDrone.serialNumber === updatedDrone.serialNumber
							? updatedDrone
							: oldDrone
					);
				}
			});

			// Finally filter drones that are older than 10 minutes
			drones = drones.filter((drone) => {
				return !isOlderThan10Minutes(drone.timestamp);
			});
		})
		.catch(function (err) {
			console.log(err);
		});
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

io.on("connection", (socket) => {
	console.log(`Client ${String(socket.id)} connected`);
	const interval = setInterval(() => {
		getData();
		socket.emit("getData", drones);
	}, 1000 * 10); // 10 seconds TODO change to 2 seconds?

	socket.on("getData", () => {
		console.log("getting data");
		socket.emit("getData", drones);
	});

	socket.on("disconnect", async (reason) => {
		console.log(`Client ${String(socket.id)} disconnected: ${reason}`);
	});
});

httpServer.listen(process.env.PORT || 3000, () => {
	console.log(`Server started on port ${process.env.PORT}`);
});
