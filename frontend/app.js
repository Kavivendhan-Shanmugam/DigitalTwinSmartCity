const $ = (id) => document.getElementById(id);

const zoneMeta = {
    environment: {
        code: "A",
        title: "ENVIRONMENT",
        detail: "Temperature, humidity, atmospheric quality and daylight telemetry."
    },
    power: {
        code: "B",
        title: "POWER GRID",
        detail: "Voltage, current, demand and distribution health monitoring."
    },
    network: {
        code: "C",
        title: "LORA MESH",
        detail: "Long-range node availability, signal strength and packet integrity."
    },
    security: {
        code: "D",
        title: "CYBER DEFENSE",
        detail: "Anomaly fusion, city health scoring and autonomous response."
    }
};

const ROUTE_SIGNALS = ["east", "west", "north", "south"];
const SIGNAL_COLORS = { red: "#ff4161", yellow: "#ffbf5a", green: "#41f3a4" };

const state = {
    selectedSector: "environment",
    data: {
        environment: { temperature: 0, humidity: 0, airQuality: 0, light: 0 },
        power: { voltage: 0, current: 0, watts: 0, gridLoad: 0 },
        traffic: {
            density: 0,
            vehicles: 0,
            meanSpeed: 0,
            phase: "NS_GREEN",
            phaseTimer: 14,
            signals: { north: "red", south: "red", east: "red", west: "red" },
            lanes: { north: 0, east: 0, south: 0, west: 0 },
            maxPerLane: 30
        },
        network: { rssi: -120, packetLoss: 100, latency: 0 },
        sectors: { environment: 0, power: 0, network: 0, security: 0 },
        risks: { air: 0, power: 0, traffic: 0, network: 0, sensor: 0 },
        threat: { score: 0, level: "NORMAL" },
        cityHealth: 0,
        nodes: {
            environment: { online: false },
            power: { online: false },
            gateway: { online: false }
        },
        incidents: [],
        packets: 0,
        uptimeSeconds: 0,
        mode: "SIMULATION",
        isNight: false,
        lightingMode: "AUTO",
        emergency: { active: false, type: null, route: null, progress: 0, etaSeconds: 0 }
    },
    lastIncidentId: null
};

function formatUptime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
    const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
    const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
}

function riskColor(value) {
    if (value >= 70) return "#ff4161";
    if (value >= 42) return "#ffbf5a";
    return "#41f3a4";
}

function healthColor(value) {
    if (value < 48) return "#ff4161";
    if (value < 75) return "#ffbf5a";
    return "#41f3a4";
}

function cityCondition(health, threat) {
    if (threat >= 70 || health < 48) return ["CRITICAL", "critical", "Immediate response protocols are active."];
    if (threat >= 38 || health < 75) return ["DEGRADED", "warning", "Anomalies are affecting city readiness."];
    return ["STABLE", "stable", "All monitored systems are within operating range."];
}

function updateSector(name, value) {
    const bar = $(`${name}Bar`);
    const label = $(`${name}Health`);
    if (!bar || !label) return;
    const color = healthColor(value);
    bar.style.width = `${value}%`;
    bar.style.background = color;
    bar.style.boxShadow = `0 0 8px ${color}`;
    label.textContent = Math.round(value);
    label.style.color = color;
}

function formatSignalPhase(phase) {
    return String(phase || "NS_GREEN").replaceAll("_", " ");
}

function updateSignalPanel(traffic) {
    const signals = traffic.signals || {};
    $("signalPhase").textContent = formatSignalPhase(traffic.phase);
    $("signalPhaseLabel").textContent = formatSignalPhase(traffic.phase);
    $("signalPhaseTimer").textContent = `${Math.max(0, traffic.phaseTimer || 0)}s`;
    $("signalVehicleCount").textContent = traffic.vehicles ?? 0;
    $("signalDensity").textContent = `${Math.round(traffic.density ?? 0)}%`;

    document.querySelectorAll(".signal-post").forEach((post) => {
        const arm = post.dataset.arm;
        const active = signals[arm] || "red";
        post.querySelectorAll(".signal-lamp").forEach((lamp) => {
            lamp.classList.toggle("active", lamp.classList.contains(active));
        });
    });
}

function updateIncidents(incidents) {
    const newestId = incidents[0]?.id ?? null;
    if (newestId === state.lastIncidentId) return;
    state.lastIncidentId = newestId;
    const feed = $("incidentFeed");

    if (!incidents.length) {
        feed.innerHTML = '<div class="empty-state">No classified incidents.</div>';
        return;
    }

    feed.innerHTML = incidents.slice(0, 6).map((incident) => {
        const time = new Date(incident.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        return `
            <div class="incident-item ${incident.severity}">
                <span class="incident-time">${time}</span>
                <span class="incident-severity"></span>
                <div class="incident-copy">
                    <strong>${incident.title}</strong>
                    <p>${incident.message}</p>
                </div>
            </div>`;
    }).join("");
}

function updateNode(elementId, node) {
    const element = $(elementId);
    const online = Boolean(node?.online);
    element.classList.toggle("offline", !online);
    element.querySelector(":scope > b").textContent = online ? "ONLINE" : "OFFLINE";
}

function updateDashboard(data) {
    state.data = data;

    $("temperature").textContent = Number(data.environment.temperature).toFixed(1);
    $("temperatureTrend").textContent = data.environment.temperature > 36 ? "ABOVE NOMINAL" : "WITHIN NOMINAL BAND";
    $("airQuality").textContent = Math.round(data.environment.airQuality);
    $("airStatus").textContent = data.environment.airQuality > 180 ? "HAZARDOUS SIGNATURE" : data.environment.airQuality > 100 ? "ELEVATED PARTICULATES" : "AIR QUALITY GOOD";
    $("gridLoad").textContent = Math.round(data.power.gridLoad);
    $("powerValue").textContent = `${Number(data.power.watts).toFixed(1)} W / ${Number(data.power.voltage).toFixed(2)} V`;
    $("signalPhase").textContent = formatSignalPhase(data.traffic.phase);
    $("vehicleCount").textContent = `${data.traffic.vehicles} VEHICLES / ${data.traffic.meanSpeed} KMH`;
    $("packetIntegrity").textContent = Math.max(0, 100 - data.network.packetLoss).toFixed(1);
    $("rssiValue").textContent = `${data.network.rssi} dBm / ${data.network.latency} ms`;

    $("operationMode").textContent = data.mode;
    $("cityHealth").textContent = Math.round(data.cityHealth);
    $("healthRing").style.setProperty("--health", data.cityHealth);
    $("healthRing").style.setProperty("--health-color", healthColor(data.cityHealth));

    const [condition, conditionClass, summary] = cityCondition(data.cityHealth, data.threat.score);
    const conditionPill = $("cityCondition");
    conditionPill.textContent = condition;
    conditionPill.className = `status-pill ${conditionClass}`;
    $("healthSummary").textContent = summary;

    Object.entries(data.sectors).forEach(([name, value]) => updateSector(name, value));

    const threatColor = riskColor(data.threat.score);
    $("threatLevel").textContent = data.threat.level;
    $("threatLevel").style.color = threatColor;
    $("threatScore").textContent = Math.round(data.threat.score);
    $("threatPanel").style.setProperty("--threat-color", threatColor);

    $("weatherReadout").textContent = `HUM ${Number(data.environment.humidity).toFixed(1)}%`;
    $("lightReadout").textContent = `LUX ${Math.round(data.environment.light).toString().padStart(4, "0")}`;
    $("lightingButton").textContent = `LIGHTS: ${data.lightingMode}`;
    updateSignalPanel(data.traffic);

    const emergency = data.emergency || { active: false };
    const emergencyBanner = $("emergencyBanner");
    emergencyBanner.classList.toggle("active", emergency.active);
    if (emergency.active) {
        $("emergencyTitle").textContent = `${String(emergency.type).toUpperCase()} / ${String(emergency.route).toUpperCase()} CORRIDOR`;
        $("emergencyEta").textContent = `ETA ${emergency.etaSeconds}s`;
    }
    $("packetCount").textContent = Math.round(data.packets).toString().padStart(6, "0");
    $("packetLoss").textContent = `${Number(data.network.packetLoss).toFixed(1)}%`;
    $("uptime").textContent = formatUptime(data.uptimeSeconds);

    updateNode("nodeEnvironment", data.nodes.environment);
    updateNode("nodePower", data.nodes.power);
    updateNode("nodeGateway", data.nodes.gateway);
    updateIncidents(data.incidents || []);
    drawThreatRadar(data.risks);
}

function selectSector(name) {
    if (!zoneMeta[name]) return;
    state.selectedSector = name;
    const meta = zoneMeta[name];
    document.querySelectorAll(".sector-row").forEach((row) => row.classList.toggle("active", row.dataset.sector === name));
    $("selectedSectorCode").textContent = meta.code;
    $("zoneCode").textContent = `SECTOR ${meta.code}`;
    $("zoneTitle").textContent = meta.title;
    $("zoneDetail").textContent = meta.detail;
}

function drawThreatRadar(risks) {
    const canvas = $("threatRadar");
    const context = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2 + 2;
    const radius = Math.min(width, height) * 0.39;
    const entries = [
        ["AIR", risks.air],
        ["GRID", risks.power],
        ["SIG", risks.traffic],
        ["NET", risks.network],
        ["SENSOR", risks.sensor]
    ];
    const angles = entries.map((_, index) => -Math.PI / 2 + index * Math.PI * 2 / entries.length);

    context.clearRect(0, 0, width, height);
    context.lineWidth = 1;

    for (let ring = 1; ring <= 4; ring += 1) {
        context.beginPath();
        angles.forEach((angle, index) => {
            const distance = radius * ring / 4;
            const x = centerX + Math.cos(angle) * distance;
            const y = centerY + Math.sin(angle) * distance;
            if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
        });
        context.closePath();
        context.strokeStyle = `rgba(72, 184, 218, ${0.08 + ring * 0.035})`;
        context.stroke();
    }

    angles.forEach((angle) => {
        context.beginPath();
        context.moveTo(centerX, centerY);
        context.lineTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
        context.strokeStyle = "rgba(72, 184, 218, .12)";
        context.stroke();
    });

    context.beginPath();
    entries.forEach((entry, index) => {
        const distance = radius * Math.max(0.08, entry[1] / 100);
        const x = centerX + Math.cos(angles[index]) * distance;
        const y = centerY + Math.sin(angles[index]) * distance;
        if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.closePath();
    const maximumRisk = Math.max(...entries.map((entry) => entry[1]));
    const color = riskColor(maximumRisk);
    context.fillStyle = `${color}22`;
    context.strokeStyle = color;
    context.shadowColor = color;
    context.shadowBlur = 7;
    context.fill();
    context.stroke();
    context.shadowBlur = 0;

    context.fillStyle = "#698397";
    context.font = "7px Consolas, monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    entries.forEach((entry, index) => {
        const x = centerX + Math.cos(angles[index]) * (radius + 13);
        const y = centerY + Math.sin(angles[index]) * (radius + 10);
        context.fillText(entry[0], x, y);
    });
}

class CityRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.context = canvas.getContext("2d");
        this.width = 1000;
        this.height = 620;
        this.elapsed = 0;
        this.lastFrame = performance.now();
        this.intersection = { x1: 322, y1: 219, x2: 679, y2: 418, cx: 500, cy: 318 };
        this.zones = {
            environment: { x: 42, y: 42, w: 280, h: 155, cx: 182, cy: 120 },
            power: { x: 678, y: 42, w: 280, h: 155, cx: 818, cy: 120 },
            network: { x: 678, y: 423, w: 280, h: 155, cx: 818, cy: 500 },
            security: { x: 42, y: 423, w: 280, h: 155, cx: 182, cy: 500 }
        };
        this.signalPosts = [
            { x: 500, y: 202, arm: "north" },
            { x: 696, y: 318, arm: "east" },
            { x: 500, y: 435, arm: "south" },
            { x: 304, y: 318, arm: "west" }
        ];
        this.buildings = [
            [87, 91, 46, 38, 7], [151, 83, 69, 51, 9], [237, 103, 42, 67, 6],
            [727, 88, 49, 69, 8], [797, 78, 53, 48, 10], [869, 104, 39, 61, 7],
            [89, 454, 52, 57, 8], [164, 445, 73, 43, 9], [253, 467, 35, 55, 6],
            [735, 451, 43, 50, 8], [802, 443, 58, 66, 10], [882, 464, 35, 44, 6]
        ];
        this.vehicles = Array.from({ length: 120 }, (_, index) => ({
            route: index % 4,
            progress: ((index * 0.173) + (index % 7) * 0.041) % 1,
            direction: [1, -1, 1, -1][index % 4],
            color: ["#38d9ff", "#ffbf5a", "#a784ff", "#41f3a4"][index % 4]
        }));
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(canvas.parentElement);
        this.canvas.addEventListener("click", (event) => this.handleClick(event));
        this.resize();
        this.draw();
        requestAnimationFrame((time) => this.frame(time));
    }

    resize() {
        const bounds = this.canvas.parentElement.getBoundingClientRect();
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = Math.max(1, Math.round(bounds.width * ratio));
        this.canvas.height = Math.max(1, Math.round(bounds.height * ratio));
        this.canvas.style.width = `${bounds.width}px`;
        this.canvas.style.height = `${bounds.height}px`;
    }

    handleClick(event) {
        const bounds = this.canvas.getBoundingClientRect();
        const x = (event.clientX - bounds.left) / bounds.width * this.width;
        const y = (event.clientY - bounds.top) / bounds.height * this.height;
        const match = Object.entries(this.zones).find(([, zone]) => x >= zone.x && x <= zone.x + zone.w && y >= zone.y && y <= zone.y + zone.h);
        if (match) selectSector(match[0]);
    }

    frame(time) {
        const delta = Math.min(50, time - this.lastFrame) / 1000;
        this.lastFrame = time;
        this.elapsed += delta;
        const meanSpeed = state.data.traffic.meanSpeed || 35;
        const signals = state.data.traffic.signals || {};
        const emergency = state.data.emergency?.active;
        const speedFactor = 0.025 + meanSpeed / 1100;

        this.vehicles.forEach((vehicle) => {
            const arm = ROUTE_SIGNALS[vehicle.route];
            const signal = emergency ? "green" : (signals[arm] || "red");
            const step = delta * speedFactor * vehicle.direction;
            let next = (vehicle.progress + step + 1) % 1;

            if (signal !== "green" && !emergency) {
                const stopLine = vehicle.direction > 0 ? 0.34 : 0.66;
                const crossingStop = vehicle.direction > 0
                    ? vehicle.progress < stopLine && next >= stopLine
                    : vehicle.progress > stopLine && next <= stopLine;
                const beforeStop = vehicle.direction > 0 ? vehicle.progress < stopLine : vehicle.progress > stopLine;

                if (signal === "red" && beforeStop && crossingStop) {
                    next = vehicle.progress;
                } else if (signal === "yellow" && beforeStop && crossingStop) {
                    next = vehicle.progress;
                }
            }

            vehicle.progress = next;
        });
        this.draw();
        requestAnimationFrame((nextTime) => this.frame(nextTime));
    }

    setupLogicalCanvas() {
        const ratioX = this.canvas.width / this.width;
        const ratioY = this.canvas.height / this.height;
        this.context.setTransform(ratioX, 0, 0, ratioY, 0, 0);
        this.context.clearRect(0, 0, this.width, this.height);
    }

    draw() {
        this.setupLogicalCanvas();
        this.drawGrid();
        this.drawZones();
        this.drawLinks();
        this.drawRoads();
        this.drawIntersection();
        this.drawEmergencyCorridor();
        this.drawBuildings();
        this.drawStreetLights();
        this.drawTrafficLights();
        this.drawVehicles();
        this.drawAmbulance();
        this.drawZoneLabels();
    }

    drawGrid() {
        const ctx = this.context;
        ctx.fillStyle = "#040c14";
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.lineWidth = 1;
        for (let x = 0; x <= this.width; x += 25) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.height);
            ctx.strokeStyle = x % 100 === 0 ? "rgba(56,217,255,.055)" : "rgba(56,217,255,.018)";
            ctx.stroke();
        }
        for (let y = 0; y <= this.height; y += 25) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.width, y);
            ctx.strokeStyle = y % 100 === 0 ? "rgba(56,217,255,.055)" : "rgba(56,217,255,.018)";
            ctx.stroke();
        }
    }

    drawZones() {
        const ctx = this.context;
        Object.entries(this.zones).forEach(([name, zone]) => {
            const health = state.data.sectors[name] ?? 100;
            const color = healthColor(health);
            const selected = state.selectedSector === name;
            ctx.save();
            ctx.setLineDash(selected ? [7, 5] : [3, 8]);
            ctx.lineDashOffset = -this.elapsed * (selected ? 12 : 5);
            ctx.lineWidth = selected ? 1.4 : 1;
            ctx.strokeStyle = selected ? `${color}aa` : `${color}38`;
            ctx.fillStyle = selected ? `${color}08` : "rgba(12,38,50,.035)";
            ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
            ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);
            ctx.restore();

            if (health < 74) {
                const pulse = 14 + (Math.sin(this.elapsed * 3) + 1) * 9;
                ctx.beginPath();
                ctx.arc(zone.cx, zone.cy, pulse, 0, Math.PI * 2);
                ctx.strokeStyle = `${color}${health < 48 ? "bb" : "77"}`;
                ctx.stroke();
            }
        });
    }

    drawRoads() {
        const ctx = this.context;
        const roads = [
            [0, 219, 1000, 219], [0, 418, 1000, 418],
            [322, 0, 322, 620], [679, 0, 679, 620]
        ];
        roads.forEach(([x1, y1, x2, y2]) => {
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.lineWidth = 35;
            ctx.strokeStyle = "#07121c";
            ctx.stroke();
            ctx.lineWidth = 1;
            ctx.strokeStyle = "rgba(56,217,255,.16)";
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.setLineDash([12, 14]);
            ctx.lineDashOffset = -this.elapsed * 9;
            ctx.strokeStyle = "rgba(135,181,195,.17)";
            ctx.stroke();
            ctx.setLineDash([]);
        });
    }

    drawIntersection() {
        const ctx = this.context;
        const box = this.intersection;
        ctx.fillStyle = "rgba(8,22,34,.92)";
        ctx.fillRect(box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1);
        ctx.strokeStyle = "rgba(56,217,255,.28)";
        ctx.lineWidth = 1;
        ctx.strokeRect(box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1);

        ctx.setLineDash([8, 10]);
        ctx.lineDashOffset = -this.elapsed * 6;
        ctx.strokeStyle = "rgba(255,255,255,.12)";
        ctx.beginPath();
        ctx.moveTo(box.cx, box.y1 + 8);
        ctx.lineTo(box.cx, box.y2 - 8);
        ctx.moveTo(box.x1 + 8, box.cy);
        ctx.lineTo(box.x2 - 8, box.cy);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = "rgba(56,217,255,.55)";
        ctx.font = "7px Consolas, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("4-WAY INTERSECTION", box.cx, box.cy - 8);
        ctx.fillStyle = "rgba(105,131,151,.85)";
        ctx.fillText(formatSignalPhase(state.data.traffic.phase), box.cx, box.cy + 8);
    }

    drawTrafficLights() {
        const ctx = this.context;
        const signals = state.data.traffic.signals || {};
        this.signalPosts.forEach((post) => {
            const active = signals[post.arm] || "red";
            const colors = ["red", "yellow", "green"];
            const lampRadius = 2.4;
            const spacing = 6.5;
            const housingW = 10;
            const housingH = spacing * 2 + 8;

            ctx.fillStyle = "rgba(3,12,20,.92)";
            ctx.fillRect(post.x - housingW / 2, post.y - housingH / 2, housingW, housingH);
            ctx.strokeStyle = "rgba(56,217,255,.35)";
            ctx.strokeRect(post.x - housingW / 2, post.y - housingH / 2, housingW, housingH);

            colors.forEach((color, index) => {
                const y = post.y - spacing + index * spacing;
                const lit = active === color;
                ctx.beginPath();
                ctx.arc(post.x, y, lampRadius, 0, Math.PI * 2);
                ctx.fillStyle = lit ? SIGNAL_COLORS[color] : "rgba(35,52,62,.85)";
                if (lit) {
                    ctx.shadowColor = SIGNAL_COLORS[color];
                    ctx.shadowBlur = 10;
                }
                ctx.fill();
                ctx.shadowBlur = 0;
            });
        });
    }

    drawLinks() {
        const ctx = this.context;
        const gateway = this.zones.network;
        const targets = [this.zones.environment, this.zones.power, this.zones.security];
        targets.forEach((target, index) => {
            const offline = index === 0 && !state.data.nodes.environment?.online;
            ctx.beginPath();
            ctx.moveTo(gateway.cx, gateway.cy);
            ctx.lineTo(target.cx, target.cy);
            ctx.setLineDash([5, 9]);
            ctx.lineDashOffset = -this.elapsed * 14;
            ctx.strokeStyle = offline ? "rgba(255,65,97,.5)" : "rgba(56,217,255,.22)";
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.setLineDash([]);
        });
    }

    drawBuildings() {
        const ctx = this.context;
        const night = state.data.isNight;
        this.buildings.forEach(([x, y, width, height, floors], buildingIndex) => {
            ctx.fillStyle = "rgba(9,29,42,.95)";
            ctx.fillRect(x + 5, y + 5, width, height);
            ctx.fillStyle = "#0a1c29";
            ctx.fillRect(x, y, width, height);
            ctx.strokeStyle = "rgba(71,174,204,.22)";
            ctx.strokeRect(x, y, width, height);
            ctx.fillStyle = "rgba(56,217,255,.05)";
            ctx.fillRect(x + 5, y + 5, width - 10, height - 10);

            const columns = Math.max(2, Math.floor(width / 15));
            const rows = Math.max(2, Math.min(4, Math.floor(height / 14)));
            for (let row = 0; row < rows; row += 1) {
                for (let column = 0; column < columns; column += 1) {
                    const lit = (row + column + buildingIndex + floors) % 3 !== 0;
                    ctx.fillStyle = night && lit ? "rgba(255,191,90,.5)" : "rgba(72,166,195,.14)";
                    ctx.fillRect(x + 7 + column * ((width - 14) / columns), y + 7 + row * ((height - 14) / rows), 3, 3);
                }
            }
        });
    }

    drawStreetLights() {
        const ctx = this.context;
        const lightsOn = state.data.lightingMode === "FORCED ON" || (state.data.lightingMode === "AUTO" && state.data.isNight);
        const positions = [];
        for (let x = 30; x < 980; x += 55) positions.push([x, 197], [x, 441]);
        for (let y = 28; y < 600; y += 55) positions.push([300, y], [701, y]);
        positions.forEach(([x, y]) => {
            ctx.beginPath();
            ctx.arc(x, y, lightsOn ? 2.7 : 1.6, 0, Math.PI * 2);
            ctx.fillStyle = lightsOn ? "#ffcf66" : "rgba(118,146,155,.28)";
            if (lightsOn) {
                ctx.shadowColor = "#ffbf5a";
                ctx.shadowBlur = 9;
            }
            ctx.fill();
            ctx.shadowBlur = 0;
        });
    }

    drawVehicles() {
        const ctx = this.context;
        const lanes = state.data.traffic.lanes || { north: 0, east: 0, south: 0, west: 0 };
        const routeCounts = [lanes.east, lanes.west, lanes.north, lanes.south].map((value) => Math.min(30, Math.max(0, Math.round(value || 0))));
        const drawnByRoute = [0, 0, 0, 0];
        this.vehicles.forEach((vehicle) => {
            if (drawnByRoute[vehicle.route] >= routeCounts[vehicle.route]) return;
            drawnByRoute[vehicle.route] += 1;
            let x;
            let y;
            let width = 10;
            let height = 4;
            if (vehicle.route === 0) {
                x = vehicle.progress * 1040 - 20;
                y = 212;
            } else if (vehicle.route === 1) {
                x = 1020 - vehicle.progress * 1040;
                y = 425;
            } else if (vehicle.route === 2) {
                x = 315;
                y = vehicle.progress * 660 - 20;
                width = 4;
                height = 10;
            } else {
                x = 686;
                y = 640 - vehicle.progress * 660;
                width = 4;
                height = 10;
            }
            ctx.fillStyle = vehicle.color;
            ctx.shadowColor = vehicle.color;
            ctx.shadowBlur = 5;
            ctx.fillRect(x, y, width, height);
            ctx.shadowBlur = 0;
        });
    }

    drawEmergencyCorridor() {
        const emergency = state.data.emergency;
        if (!emergency?.active) return;
        const ctx = this.context;
        const routeGeometry = {
            east: [0, 212, 1000, 212],
            west: [1000, 425, 0, 425],
            north: [315, 620, 315, 0],
            south: [686, 0, 686, 620]
        };
        const route = routeGeometry[emergency.route] || routeGeometry.east;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(route[0], route[1]);
        ctx.lineTo(route[2], route[3]);
        ctx.lineWidth = 7;
        ctx.strokeStyle = "rgba(65,243,164,.18)";
        ctx.shadowColor = "#41f3a4";
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.setLineDash([16, 16]);
        ctx.lineDashOffset = -this.elapsed * 38;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(65,243,164,.9)";
        ctx.stroke();
        ctx.restore();
    }

    drawAmbulance() {
        const emergency = state.data.emergency;
        if (!emergency?.active) return;
        const ctx = this.context;
        const liveProgress = emergency.startedAt && emergency.durationSeconds
            ? (Date.now() - emergency.startedAt) / (emergency.durationSeconds * 1000)
            : emergency.progress || 0;
        const progress = Math.max(0, Math.min(1, liveProgress));
        let x;
        let y;
        let width = 20;
        let height = 9;
        if (emergency.route === "west") {
            x = 1010 - progress * 1040;
            y = 420;
        } else if (emergency.route === "north") {
            x = 310;
            y = 630 - progress * 660;
            width = 9;
            height = 20;
        } else if (emergency.route === "south") {
            x = 681;
            y = -10 + progress * 660;
            width = 9;
            height = 20;
        } else {
            x = -10 + progress * 1040;
            y = 207;
        }

        const flash = Math.sin(this.elapsed * 15) > 0;
        ctx.save();
        ctx.shadowColor = flash ? "#ff4161" : "#468cff";
        ctx.shadowBlur = 20;
        ctx.fillStyle = "#eafaff";
        ctx.fillRect(x, y, width, height);
        ctx.fillStyle = "#ff4161";
        if (width > height) {
            ctx.fillRect(x + width / 2 - 2, y + 1, 4, height - 2);
            ctx.fillRect(x + 3, y - 2, 5, 3);
            ctx.fillStyle = "#468cff";
            ctx.fillRect(x + width - 8, y - 2, 5, 3);
        } else {
            ctx.fillRect(x + 1, y + height / 2 - 2, width - 2, 4);
            ctx.fillRect(x - 2, y + 3, 3, 5);
            ctx.fillStyle = "#468cff";
            ctx.fillRect(x - 2, y + height - 8, 3, 5);
        }
        ctx.restore();
    }

    drawZoneLabels() {
        const ctx = this.context;
        Object.entries(this.zones).forEach(([name, zone]) => {
            const meta = zoneMeta[name];
            const health = state.data.sectors[name] ?? 100;
            const color = healthColor(health);
            ctx.fillStyle = "rgba(3,12,20,.86)";
            ctx.fillRect(zone.x + 8, zone.y + zone.h - 26, 111, 18);
            ctx.strokeStyle = `${color}4d`;
            ctx.strokeRect(zone.x + 8, zone.y + zone.h - 26, 111, 18);
            ctx.fillStyle = color;
            ctx.font = "7px Consolas, monospace";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(`${meta.code} / ${meta.title}`, zone.x + 14, zone.y + zone.h - 17);
            ctx.textAlign = "right";
            ctx.fillStyle = "#9ec2cd";
            ctx.fillText(`${Math.round(health)}`, zone.x + 112, zone.y + zone.h - 17);
        });
    }
}

const socket = typeof io === "function" ? io() : null;

function setConnection(online) {
    const dot = $("connectionDot");
    dot.className = `connection-dot ${online ? "online" : "offline"}`;
    $("connectionText").textContent = online ? "ENCRYPTED / LIVE" : "LINK OFFLINE";
}

if (socket) {
    socket.on("connect", () => setConnection(true));
    socket.on("disconnect", () => setConnection(false));
    socket.on("cityData", updateDashboard);
} else {
    setConnection(false);
}

document.querySelectorAll(".sector-row").forEach((row) => {
    row.addEventListener("click", () => selectSector(row.dataset.sector));
});

document.querySelectorAll("[data-incident]").forEach((button) => {
    button.addEventListener("click", () => {
        if (!socket?.connected) return;
        button.disabled = true;
        socket.emit("triggerIncident", button.dataset.incident);
        setTimeout(() => { button.disabled = false; }, 700);
    });
});

$("restoreButton").addEventListener("click", () => socket?.emit("recoverSystems"));
$("lightingButton").addEventListener("click", () => socket?.emit("toggleLighting"));

function setSignalConsole(open) {
    $("signalConsole").classList.toggle("open", open);
    $("signalConsoleButton").classList.toggle("active", open);
    $("signalConsoleButton").setAttribute("aria-expanded", String(open));
}

$("signalConsoleButton").setAttribute("aria-expanded", "false");
$("signalConsoleButton").addEventListener("click", () => setSignalConsole(!$("signalConsole").classList.contains("open")));
$("signalConsoleClose").addEventListener("click", () => setSignalConsole(false));

$("ambulanceButton").addEventListener("click", () => {
    if (!socket?.connected) return;
    socket.emit("dispatchEmergency", "ambulance");
    setSignalConsole(false);
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setSignalConsole(false);
});

setInterval(() => {
    $("systemTime").textContent = new Date().toLocaleTimeString([], { hour12: false });
}, 250);

selectSector("environment");
drawThreatRadar(state.data.risks);
new CityRenderer($("cityCanvas"));

if (new URLSearchParams(window.location.search).get("signals") === "open") {
    document.documentElement.classList.add("signal-console-deep-link");
    setSignalConsole(true);
}

fetch("/api/status")
    .then((response) => response.ok ? response.json() : Promise.reject(new Error("Status unavailable")))
    .then(updateDashboard)
    .catch(() => setConnection(false));
