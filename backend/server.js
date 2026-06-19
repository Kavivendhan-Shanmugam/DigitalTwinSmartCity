const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT) || 3000;
const TICK_MS = 1000;
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "..", "frontend")));

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value, places = 1) => Number(value.toFixed(places));
const randomBetween = (min, max) => min + Math.random() * (max - min);

const runtime = {
    startedAt: Date.now(),
    tick: 0,
    packets: 18420,
    liveTelemetryUntil: 0,
    lightingOverride: null,
    anomalies: { gas: 0, power: 0, traffic: 0, network: 0 },
    trafficControl: {
        mode: "AUTO",
        maxPerLane: 30,
        lanes: { north: 7, east: 8, south: 6, west: 6 }
    },
    emergency: {
        active: false,
        type: null,
        route: null,
        startedAt: 0,
        durationSeconds: 24
    },
    nodes: {
        environment: { online: true, lastSeen: Date.now() },
        power: { online: true, lastSeen: Date.now() },
        gateway: { online: true, lastSeen: Date.now() }
    }
};

const telemetry = {
    environment: { temperature: 30.2, humidity: 61.4, airQuality: 74, light: 680 },
    power: { voltage: 12.08, current: 1.64, watts: 19.8, gridLoad: 42 },
    traffic: {
        density: 34,
        vehicles: 27,
        meanSpeed: 42,
        mode: "AUTO",
        lanes: { north: 7, east: 8, south: 6, west: 6 },
        maxPerLane: 30
    },
    network: { rssi: -73, packetLoss: 0.4, latency: 48 },
    sectors: { environment: 94, power: 96, traffic: 88, network: 97, security: 94 },
    risks: { air: 15, power: 10, traffic: 30, network: 8, sensor: 12 },
    threat: { score: 12, level: "NORMAL" },
    cityHealth: 94,
    incidents: []
};

let incidentSequence = 0;

function addIncident(severity, title, message, sector) {
    telemetry.incidents.unshift({
        id: ++incidentSequence,
        timestamp: new Date().toISOString(),
        severity,
        title,
        message,
        sector
    });
    telemetry.incidents = telemetry.incidents.slice(0, 12);
}

addIncident("low", "Digital twin synchronized", "All five city sectors are reporting nominal state.", "security");
addIncident("low", "LoRa mesh authenticated", "Environment and power nodes joined the gateway.", "network");
addIncident("low", "Traffic model initialized", "Virtual mobility engine is tracking 27 vehicles.", "traffic");

function threatLevel(score) {
    if (score >= 80) return "CRITICAL";
    if (score >= 60) return "HIGH";
    if (score >= 38) return "MEDIUM";
    if (score >= 26) return "LOW";
    return "NORMAL";
}

function updateSimulation() {
    runtime.tick += 1;
    runtime.packets += Math.floor(randomBetween(7, 15));

    const hour = new Date().getHours();
    const naturalNight = hour < 6 || hour >= 18;
    const isNight = runtime.lightingOverride === null ? naturalNight : runtime.lightingOverride;
    const wave = Math.sin(runtime.tick / 18);

    if (Date.now() > runtime.liveTelemetryUntil) {
        telemetry.environment.temperature = clamp(30.2 + wave * 1.3 + randomBetween(-0.18, 0.18) + runtime.anomalies.gas * 0.018, 18, 55);
        telemetry.environment.humidity = clamp(61 - wave * 2.6 + randomBetween(-0.4, 0.4), 15, 98);
        telemetry.environment.airQuality = clamp(72 + randomBetween(-3, 3) + runtime.anomalies.gas * 2.35, 0, 500);
        telemetry.environment.light = isNight ? randomBetween(8, 34) : randomBetween(610, 760);

        telemetry.power.gridLoad = clamp(42 + Math.sin(runtime.tick / 13) * 5 + runtime.anomalies.power * 0.62, 5, 100);
        telemetry.power.voltage = clamp(12.08 + randomBetween(-0.05, 0.05) - runtime.anomalies.power * 0.011, 8.5, 13);
        telemetry.power.current = clamp(1.55 + telemetry.power.gridLoad * 0.018 + randomBetween(-0.06, 0.06), 0, 6);
        telemetry.power.watts = telemetry.power.voltage * telemetry.power.current;

        if (runtime.trafficControl.mode === "MANUAL") {
            const manualTotal = Object.values(runtime.trafficControl.lanes).reduce((sum, value) => sum + value, 0);
            const capacity = runtime.trafficControl.maxPerLane * 4;
            telemetry.traffic.density = clamp(manualTotal / capacity * 100, 0, 100);
            telemetry.traffic.vehicles = manualTotal;
            telemetry.traffic.meanSpeed = clamp(60 - telemetry.traffic.density * 0.56, 4, 58);
        } else {
            telemetry.traffic.density = clamp(32 + Math.sin(runtime.tick / 9) * 8 + randomBetween(-2, 2) + runtime.anomalies.traffic * 0.68, 5, 100);
            telemetry.traffic.vehicles = Math.round(14 + telemetry.traffic.density * 0.42);
            telemetry.traffic.meanSpeed = clamp(58 - telemetry.traffic.density * 0.52, 4, 55);
            const total = telemetry.traffic.vehicles;
            const north = Math.max(0, Math.round(total * 0.25 + randomBetween(-1, 1)));
            const east = Math.max(0, Math.round(total * 0.29 + randomBetween(-1, 1)));
            const south = Math.max(0, Math.round(total * 0.22 + randomBetween(-1, 1)));
            runtime.trafficControl.lanes = {
                north,
                east,
                south,
                west: Math.max(0, total - north - east - south)
            };
        }

        telemetry.network.rssi = clamp(-72 + randomBetween(-4, 3) - runtime.anomalies.network * 0.22, -122, -45);
        telemetry.network.packetLoss = clamp(0.35 + randomBetween(0, 0.35) + runtime.anomalies.network * 0.15, 0, 35);
        telemetry.network.latency = Math.round(clamp(42 + randomBetween(-5, 8) + runtime.anomalies.network * 0.8, 20, 360));
    }

    runtime.nodes.environment.online = runtime.anomalies.network < 42;
    runtime.nodes.power.online = true;
    runtime.nodes.gateway.online = true;
    runtime.nodes.gateway.lastSeen = Date.now();

    const airRisk = clamp((telemetry.environment.airQuality - 45) / 2.4, 4, 100);
    const powerRisk = clamp((telemetry.power.gridLoad - 38) * 1.45 + Math.abs(12 - telemetry.power.voltage) * 15, 4, 100);
    let trafficRisk = clamp((telemetry.traffic.density - 22) * 1.25, 4, 100);
    if (runtime.emergency.active) trafficRisk = Math.max(trafficRisk, 55);
    const networkRisk = clamp(telemetry.network.packetLoss * 3.3 + Math.max(0, -telemetry.network.rssi - 78) * 1.5, 4, 100);
    const sensorRisk = clamp(Math.abs(telemetry.environment.temperature - 30) * 6 + Math.abs(telemetry.environment.humidity - 60) * 0.45, 4, 100);

    telemetry.risks = {
        air: round(airRisk),
        power: round(powerRisk),
        traffic: round(trafficRisk),
        network: round(networkRisk),
        sensor: round(sensorRisk)
    };

    telemetry.sectors.environment = round(clamp(100 - airRisk * 0.7 - sensorRisk * 0.18, 0, 100));
    telemetry.sectors.power = round(clamp(100 - powerRisk * 0.82, 0, 100));
    telemetry.sectors.traffic = round(clamp(100 - trafficRisk * 0.72, 0, 100));
    telemetry.sectors.network = round(clamp(100 - networkRisk * 0.84, 0, 100));

    const weightedThreat = airRisk * 0.28 + powerRisk * 0.22 + trafficRisk * 0.18 + networkRisk * 0.22 + sensorRisk * 0.10;
    const peakRisk = Math.max(airRisk, powerRisk, trafficRisk, networkRisk, sensorRisk);
    telemetry.threat.score = Math.round(clamp(weightedThreat * 0.55 + peakRisk * 0.65, 0, 100));
    telemetry.threat.level = threatLevel(telemetry.threat.score);
    telemetry.sectors.security = round(clamp(100 - telemetry.threat.score * 0.8, 0, 100));
    telemetry.cityHealth = Math.round(Object.values(telemetry.sectors).reduce((sum, value) => sum + value, 0) / 5);

    telemetry.environment.temperature = round(telemetry.environment.temperature);
    telemetry.environment.humidity = round(telemetry.environment.humidity);
    telemetry.environment.airQuality = Math.round(telemetry.environment.airQuality);
    telemetry.environment.light = Math.round(telemetry.environment.light);
    telemetry.power.voltage = round(telemetry.power.voltage, 2);
    telemetry.power.current = round(telemetry.power.current, 2);
    telemetry.power.watts = round(telemetry.power.watts);
    telemetry.power.gridLoad = Math.round(telemetry.power.gridLoad);
    telemetry.traffic.density = Math.round(telemetry.traffic.density);
    telemetry.traffic.meanSpeed = Math.round(telemetry.traffic.meanSpeed);
    telemetry.traffic.mode = runtime.trafficControl.mode;
    telemetry.traffic.lanes = { ...runtime.trafficControl.lanes };
    telemetry.traffic.maxPerLane = runtime.trafficControl.maxPerLane;
    telemetry.network.rssi = Math.round(telemetry.network.rssi);
    telemetry.network.packetLoss = round(telemetry.network.packetLoss);

    for (const key of Object.keys(runtime.anomalies)) {
        runtime.anomalies[key] = runtime.anomalies[key] < 0.4 ? 0 : runtime.anomalies[key] * 0.965;
    }

    if (runtime.emergency.active) {
        const elapsedSeconds = (Date.now() - runtime.emergency.startedAt) / 1000;
        if (elapsedSeconds >= runtime.emergency.durationSeconds) {
            runtime.emergency.active = false;
            addIncident("low", "Emergency corridor cleared", "The ambulance reached its destination and normal signal timing resumed.", "traffic");
        }
    }

    return buildSnapshot(isNight);
}

function buildSnapshot(isNight = false) {
    const elapsedSeconds = runtime.emergency.active ? (Date.now() - runtime.emergency.startedAt) / 1000 : 0;
    const emergency = {
        ...runtime.emergency,
        progress: runtime.emergency.active ? clamp(elapsedSeconds / runtime.emergency.durationSeconds, 0, 1) : 0,
        etaSeconds: runtime.emergency.active ? Math.max(0, Math.ceil(runtime.emergency.durationSeconds - elapsedSeconds)) : 0
    };
    return {
        ...telemetry,
        nodes: runtime.nodes,
        packets: runtime.packets,
        uptimeSeconds: Math.floor((Date.now() - runtime.startedAt) / 1000),
        mode: Date.now() < runtime.liveTelemetryUntil ? "HARDWARE" : "SIMULATION",
        isNight,
        lightingMode: runtime.lightingOverride === null ? "AUTO" : runtime.lightingOverride ? "FORCED ON" : "FORCED OFF",
        emergency,
        serverTime: new Date().toISOString()
    };
}

function injectIncident(type) {
    const definitions = {
        gas: ["critical", "Gas concentration surge", "MQ sensor signature exceeded the safe air-quality envelope.", "environment", 74],
        power: ["high", "Power demand spike", "Grid load rose beyond the predicted operating band.", "power", 82],
        traffic: ["medium", "Congestion cluster predicted", "Traffic model detected compounding delay in Sector C.", "traffic", 78],
        network: ["high", "Environment node unreachable", "LoRa heartbeat expired; failover monitoring enabled.", "network", 68]
    };
    const definition = definitions[type];
    if (!definition) return false;
    runtime.anomalies[type] = Math.max(runtime.anomalies[type], definition[4]);
    addIncident(definition[0], definition[1], definition[2], definition[3]);
    return true;
}

function recoverSystems() {
    runtime.anomalies = { gas: 0, power: 0, traffic: 0, network: 0 };
    runtime.nodes.environment.online = true;
    telemetry.environment.airQuality = 76;
    telemetry.power.voltage = 12.06;
    telemetry.power.gridLoad = 43;
    telemetry.traffic.density = 35;
    telemetry.network.packetLoss = 0.4;
    telemetry.network.rssi = -72;
    runtime.trafficControl.mode = "AUTO";
    runtime.emergency.active = false;
    addIncident("low", "Autonomous recovery complete", "Affected sectors returned to their nominal operating envelopes.", "security");
}

function setTrafficSimulation(payload) {
    if (!payload || !["AUTO", "MANUAL"].includes(payload.mode)) return false;

    if (payload.mode === "MANUAL") {
        if (!payload.lanes || typeof payload.lanes !== "object") return false;
        const nextLanes = {};
        for (const lane of ["north", "east", "south", "west"]) {
            const value = Number(payload.lanes[lane]);
            if (!Number.isFinite(value)) return false;
            nextLanes[lane] = Math.round(clamp(value, 0, runtime.trafficControl.maxPerLane));
        }
        runtime.trafficControl.mode = "MANUAL";
        runtime.trafficControl.lanes = nextLanes;
        const total = Object.values(runtime.trafficControl.lanes).reduce((sum, value) => sum + value, 0);
        addIncident("low", "Manual traffic model loaded", `${total} virtual vehicles distributed across four directional lanes.`, "traffic");
    } else {
        runtime.trafficControl.mode = "AUTO";
        addIncident("low", "Automatic traffic flow resumed", "Lane volumes are again controlled by the virtual mobility engine.", "traffic");
    }
    return true;
}

function dispatchEmergency(type = "ambulance") {
    const allowedTypes = ["ambulance", "fire", "police"];
    if (!allowedTypes.includes(type)) return false;
    const route = Object.entries(runtime.trafficControl.lanes).sort((a, b) => b[1] - a[1])[0][0];
    runtime.emergency = {
        active: true,
        type,
        route,
        startedAt: Date.now(),
        durationSeconds: 24
    };
    const label = type.charAt(0).toUpperCase() + type.slice(1);
    addIncident("high", `${label} priority route active`, `Signals switched to emergency priority on the ${route.toUpperCase()} corridor.`, "traffic");
    return true;
}

app.get("/api/status", (_request, response) => response.json(buildSnapshot()));

app.post("/api/telemetry", (request, response) => {
    const { nodeId, telemetry: incoming } = request.body || {};
    if (!incoming || typeof incoming !== "object" || !["environment", "power"].includes(nodeId)) {
        return response.status(400).json({ error: "Expected nodeId (environment or power) and telemetry object." });
    }

    const allowed = nodeId === "environment"
        ? ["temperature", "humidity", "airQuality", "light"]
        : ["voltage", "current", "watts", "gridLoad"];

    for (const key of allowed) {
        if (Number.isFinite(Number(incoming[key]))) telemetry[nodeId][key] = Number(incoming[key]);
    }

    runtime.nodes[nodeId].online = true;
    runtime.nodes[nodeId].lastSeen = Date.now();
    runtime.liveTelemetryUntil = Date.now() + 10000;
    response.status(202).json({ accepted: true, nodeId });
});

app.post("/api/incidents/:type", (request, response) => {
    if (!injectIncident(request.params.type)) return response.status(404).json({ error: "Unknown incident type." });
    const snapshot = updateSimulation();
    io.emit("cityData", snapshot);
    response.json({ accepted: true, snapshot });
});

app.post("/api/recover", (_request, response) => {
    recoverSystems();
    const snapshot = updateSimulation();
    io.emit("cityData", snapshot);
    response.json({ accepted: true, snapshot });
});

app.post("/api/traffic", (request, response) => {
    if (!setTrafficSimulation(request.body)) return response.status(400).json({ error: "Expected mode AUTO or MANUAL with north/east/south/west lane counts." });
    const snapshot = updateSimulation();
    io.emit("cityData", snapshot);
    response.json({ accepted: true, snapshot });
});

app.post("/api/emergency/:type", (request, response) => {
    if (!dispatchEmergency(request.params.type)) return response.status(400).json({ error: "Emergency type must be ambulance, fire, or police." });
    const snapshot = updateSimulation();
    io.emit("cityData", snapshot);
    response.json({ accepted: true, snapshot });
});

io.on("connection", (socket) => {
    socket.emit("cityData", updateSimulation());
    socket.on("triggerIncident", (type) => {
        if (injectIncident(type)) io.emit("cityData", updateSimulation());
    });
    socket.on("recoverSystems", () => {
        recoverSystems();
        io.emit("cityData", updateSimulation());
    });
    socket.on("setTrafficSimulation", (payload) => {
        if (setTrafficSimulation(payload)) io.emit("cityData", updateSimulation());
    });
    socket.on("dispatchEmergency", (type) => {
        if (dispatchEmergency(type)) io.emit("cityData", updateSimulation());
    });
    socket.on("toggleLighting", () => {
        if (runtime.lightingOverride === null) runtime.lightingOverride = true;
        else if (runtime.lightingOverride === true) runtime.lightingOverride = false;
        else runtime.lightingOverride = null;
        io.emit("cityData", updateSimulation());
    });
});

setInterval(() => io.emit("cityData", updateSimulation()), TICK_MS);

server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
        console.error(`Port ${PORT} is already in use. Stop the other Sentinel-X instance or run: $env:PORT=3001; npm start`);
        process.exit(1);
    }
    console.error("Failed to start Sentinel-X server:", error.message);
    process.exit(1);
});

server.listen(PORT, () => {
    console.log(`Sentinel-X command center ready at http://localhost:${PORT}`);
});
