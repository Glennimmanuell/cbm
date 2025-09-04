function showArchitecture() {
    document.getElementById('architectureSection').classList.add('active');
    document.getElementById('monitoringSection').classList.remove('active');
    document.getElementById('notificationsSection').classList.remove('active');
    document.querySelectorAll('.nav-btn')[0].classList.add('active');
    document.querySelectorAll('.nav-btn')[1].classList.remove('active');
    document.querySelectorAll('.nav-btn')[2].classList.remove('active');
    
    setTimeout(() => {
        resizeCanvas();
    }, 100);
}

function showMonitoring() {
    document.getElementById('architectureSection').classList.remove('active');
    document.getElementById('monitoringSection').classList.add('active');
    document.getElementById('notificationsSection').classList.remove('active');
    document.querySelectorAll('.nav-btn')[0].classList.remove('active');
    document.querySelectorAll('.nav-btn')[1].classList.add('active');
    document.querySelectorAll('.nav-btn')[2].classList.remove('active');
    
    setTimeout(() => {
        initializeDashboard();
        establishDataConnection();
    }, 100);
}

function showNotifications() {
    document.getElementById('architectureSection').classList.remove('active');
    document.getElementById('monitoringSection').classList.remove('active');
    document.getElementById('notificationsSection').classList.add('active');
    document.querySelectorAll('.nav-btn')[0].classList.remove('active');
    document.querySelectorAll('.nav-btn')[1].classList.remove('active');
    document.querySelectorAll('.nav-btn')[2].classList.add('active');
    
    setTimeout(() => {
        renderNotifications();
        updateNotificationStats();
    }, 100);
}

const mqttClient = mqtt.connect("wss://broker.hivemq.com:8884/mqtt");
const canvas = document.getElementById('canvas');
const canvasContainer = document.getElementById('canvas-container');
const connectionsLayer = document.getElementById('connections');
const gridOverlay = document.getElementById('grid');
let components = [];
let connections = [];
let selectedComponent = null;
let isDraggingConnection = false;
let connectingFrom = null;
let dragOffset = { x: 0, y: 0 };
let gridVisible = true;
let lastCriticalSent = {};

// const TOPIC_METRICS  = "dd2d15b7eb993965d64d1aa35e51a369";
// const TOPIC_CRITICAL = "dc41fccec8dc3fb09f55cee7d731dcd7";

const TOPIC_METRICS  = "dd2d15b7eb993965d64d1aa35e51a369";
const TOPIC_CRITICAL = "topic/critical";

mqttClient.on("connect", () => {
    console.log("Connected to HiveMQ broker");
});
mqttClient.on("error", (err) => {
    console.error("MQTT error:", err);
});

function resizeCanvas() {
    if (!canvas) return;
    const rect = canvasContainer.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
}

const componentIcons = {
    'Sensor': '📡', 'Actuator': '⚙️', 'Motor': '🔧',
    'PLC': '🏭', 'HMI': '🖥️', 'Safety': '🛡️',
    'Gateway': '🌐', 'Switch': '🔌', 'Router': '📶',
    'Cloud': '☁️', 'Analytics': '📊', 'Dashboard': '📈'
};

const componentColors = {
    'Sensor': '#4caf50', 'Actuator': '#ff9800', 'Motor': '#9c27b0',
    'PLC': '#1976d2', 'HMI': '#2196f3', 'Safety': '#f44336',
    'Gateway': '#607d8b', 'Switch': '#795548', 'Router': '#3f51b5',
    'Cloud': '#00bcd4', 'Analytics': '#8bc34a', 'Dashboard': '#ffc107'
};

function toggleGrid() {
    gridVisible = !gridVisible;
    if (gridVisible) {
        gridOverlay.classList.remove('hidden');
    } else {
        gridOverlay.classList.add('hidden');
    }
}

function initializeArchitecture() {
    document.querySelectorAll('.component-item').forEach(item => {
        item.addEventListener('dragstart', e => {
            e.dataTransfer.setData('componentType', item.dataset.type);
            e.dataTransfer.setData('componentIcon', item.dataset.icon);
        });
    });

    if (canvasContainer) {
        canvasContainer.addEventListener('dragover', e => {
            e.preventDefault();
        });

        canvasContainer.addEventListener('drop', e => {
            e.preventDefault();
            const componentType = e.dataTransfer.getData('componentType');
            const componentIcon = e.dataTransfer.getData('componentIcon');
            
            const rect = canvasContainer.getBoundingClientRect();
            const x = e.clientX - rect.left - 60;
            const y = e.clientY - rect.top - 30;
            
            createComponent(componentType, componentIcon, x, y);
        });
    }
}

function createComponent(type, icon, x, y) {
    const component = {
        id: Date.now() + Math.random(),
        type: type,
        icon: icon || componentIcons[type],
        iconType: icon && icon.includes('.png') ? 'image' : 'emoji',
        x: x,
        y: y,
        width: 120,
        height: 60,
        name: type + "_" + (components.length + 1),
        description: '',
        ip: ''
    };
    components.push(component);
    renderComponent(component);
    saveArchitectureData();
}

function renderComponent(component) {
    const div = document.createElement('div');
    div.className = 'component-block';
    div.style.left = component.x + 'px';
    div.style.top = component.y + 'px';
    div.style.width = component.width + 'px';
    div.style.height = component.height + 'px';
    div.style.borderColor = componentColors[component.type] || '#142c46';
    div.dataset.componentId = component.id;

    let iconHTML = '';
    if (component.iconType === 'image') {
        iconHTML = `<img src="${component.icon}" 
                        alt="${component.type}" 
                        style="width:32px; height:32px; object-fit:contain;">`;
    } else {
        iconHTML = component.icon;
    }

    div.innerHTML = `
        <div class="block-icon" 
            style="background:${component.iconType === 'image' ? 'transparent' : (componentColors[component.type] || '#1976d2')}; 
                    display:flex; 
                    align-items:center; 
                    justify-content:center;">
            ${iconHTML}
        </div>
        <div class="block-title">${component.name}</div>
        <div class="connection-point input" data-component-id="${component.id}" data-type="input"></div>
        <div class="connection-point output" data-component-id="${component.id}" data-type="output"></div>
        <button class="delete-btn" onclick="deleteComponent('${component.id}')">x</button>
    `;
    
    div.addEventListener('mousedown', startDrag);
    div.addEventListener('click', selectComponent);

    const inputPoint = div.querySelector('.connection-point.input');
    const outputPoint = div.querySelector('.connection-point.output');
    
    if (inputPoint && outputPoint) {
        inputPoint.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            startConnection(e, component.id, 'input');
        });
        
        outputPoint.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            startConnection(e, component.id, 'output');
        });
    }
    
    if (canvasContainer) {
        canvasContainer.appendChild(div);
    }
}

function startDrag(e) {
    if (e.target.classList.contains('connection-point') || e.target.classList.contains('delete-btn') || isDraggingConnection) return;
    
    const componentDiv = e.currentTarget;
    const componentId = componentDiv.dataset.componentId;
    const component = components.find(c => c.id == componentId);
    
    if (!component) return;
    
    dragOffset.x = e.clientX - component.x;
    dragOffset.y = e.clientY - component.y;
    
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);
    
    function drag(e) {
        component.x = e.clientX - dragOffset.x;
        component.y = e.clientY - dragOffset.y;
        componentDiv.style.left = component.x + 'px';
        componentDiv.style.top = component.y + 'px';
        updateConnections();
    }
    
    function stopDrag() {
        document.removeEventListener('mousemove', drag);
        document.removeEventListener('mouseup', stopDrag);
        saveArchitectureData();
    }
}

function selectComponent(e) {
    document.querySelectorAll('.component-block').forEach(el => {
        el.classList.remove('selected');
    });
    
    const componentDiv = e.currentTarget;
    componentDiv.classList.add('selected');
    
    const componentId = componentDiv.dataset.componentId;
    selectedComponent = components.find(c => c.id == componentId);
    
    if (selectedComponent) {
        showProperties(selectedComponent);
    }
}

function showProperties(component) {
    const panel = document.getElementById('propertiesPanel');
    if (!panel) return;
    
    document.getElementById('componentName').value = component.name;
    document.getElementById('componentDesc').value = component.description;
    document.getElementById('componentIP').value = component.ip;
    panel.style.display = 'block';
    
    document.getElementById('componentName').oninput = (e) => {
        component.name = e.target.value;
        const div = document.querySelector(`[data-component-id="${component.id}"]`);
        if (div) {
            const titleEl = div.querySelector('.block-title');
            if (titleEl) titleEl.textContent = component.name;
        }
        saveArchitectureData();
    };
    document.getElementById('componentDesc').oninput = (e) => {
        component.description = e.target.value;
        saveArchitectureData();
    };
    document.getElementById('componentIP').oninput = (e) => {
        component.ip = e.target.value;
        saveArchitectureData();
    };
}

function startConnection(e, componentId, type) {
    e.preventDefault();
    e.stopPropagation();
    
    isDraggingConnection = true;
    connectingFrom = { componentId, type };
    
    e.target.classList.add('connecting');
    
    document.body.style.cursor = 'crosshair';
    document.addEventListener('mousemove', dragConnection);
    document.addEventListener('mouseup', endConnection);
}

let tempLine = null;

function dragConnection(e) {
    if (!isDraggingConnection || !connectingFrom || !canvasContainer) return;
    
    const fromComponent = components.find(c => c.id == connectingFrom.componentId);
    if (!fromComponent) return;
    
    const rect = canvasContainer.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const fromX = fromComponent.x + (connectingFrom.type === 'output' ? fromComponent.width : 0);
    const fromY = fromComponent.y + fromComponent.height / 2;
    
    if (tempLine) {
        tempLine.remove();
    }
    
    tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    tempLine.setAttribute('x1', fromX);
    tempLine.setAttribute('y1', fromY);
    tempLine.setAttribute('x2', mouseX);
    tempLine.setAttribute('y2', mouseY);
    tempLine.style.stroke = '#ff5722';
    tempLine.style.strokeWidth = '2';
    tempLine.style.opacity = '0.6';
    tempLine.style.strokeDasharray = '4,4';
    tempLine.style.pointerEvents = 'none';
    if (connectionsLayer) {
        connectionsLayer.appendChild(tempLine);
    }
}

function endConnection(e) {
    if (!isDraggingConnection) return;
    document.body.style.cursor = '';
    
    const target = document.elementFromPoint(e.clientX, e.clientY);
    
    if (target && target.classList.contains('connection-point')) {
        const targetComponentId = target.dataset.componentId;
        const targetType = target.dataset.type;
        if (connectingFrom.componentId !== targetComponentId) {
            createConnection(connectingFrom, { componentId: targetComponentId, type: targetType });
        }
    }
    
    isDraggingConnection = false;
    connectingFrom = null;
    
    if (tempLine) {
        tempLine.remove();
        tempLine = null;
    }
    
    document.querySelectorAll('.connection-point').forEach(point => {
        point.classList.remove('connecting');
    });
    
    document.removeEventListener('mousemove', dragConnection);
    document.removeEventListener('mouseup', endConnection);
}

function createConnection(from, to) {
    const existingConnection = connections.find(conn => 
        (conn.from.componentId === from.componentId && conn.to.componentId === to.componentId) ||
        (conn.from.componentId === to.componentId && conn.to.componentId === from.componentId)
    );
    
    if (existingConnection) {
        return;
    }
    
    const connection = {
        id: Date.now() + Math.random(),
        from: from,
        to: to
    };
    connections.push(connection);
    updateConnections();
    saveArchitectureData();
}

function getConnectionPointPosition(componentId, type) {
    const pointEl = document.querySelector(".connection-point." + type + "[data-component-id='" + componentId + "']");
    if (!pointEl || !canvasContainer) return { x: 0, y: 0 };
    const rect = pointEl.getBoundingClientRect();
    const containerRect = canvasContainer.getBoundingClientRect();
    return {
        x: rect.left + rect.width / 2 - containerRect.left,
        y: rect.top + rect.height / 2 - containerRect.top
    };
}

function updateConnections() {
    if (!connectionsLayer) return;
    connectionsLayer.innerHTML = '';
    connections.forEach((conn, index) => {
        const fromPos = getConnectionPointPosition(conn.from.componentId, conn.from.type);
        const toPos = getConnectionPointPosition(conn.to.componentId, conn.to.type);
        
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.style.cursor = 'pointer';
        group.dataset.connectionIndex = index;

        const midX = (fromPos.x + toPos.x) / 2;
        const points = [
        `${fromPos.x},${fromPos.y}`,
        `${midX},${fromPos.y}`,
        `${midX},${toPos.y}`,
        `${toPos.x},${toPos.y}`
        ];

        if (conn.waypoints && conn.waypoints.length > 0) {
        const wpPoints = conn.waypoints.map(p => `${p.x},${p.y}`);
        points.splice(1, 0, ...wpPoints);
        }

        const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        polyline.setAttribute("points", points.join(" "));
        polyline.setAttribute("stroke", "#142c46");
        polyline.setAttribute("stroke-width", "2");
        polyline.setAttribute("fill", "none");
        polyline.style.cursor = "pointer";

        polyline.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (confirm("Delete this connection?")) {
            connections.splice(index, 1);
            updateConnections();
            saveArchitectureData();
        }
        });

        polyline.addEventListener("click", () => {
        showWaypointHandles(conn);
        });

        const clickLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        clickLine.setAttribute('x1', fromPos.x);
        clickLine.setAttribute('y1', fromPos.y);
        clickLine.setAttribute('x2', toPos.x);
        clickLine.setAttribute('y2', toPos.y);
        clickLine.style.stroke = 'transparent';
        clickLine.style.strokeWidth = '20';
        clickLine.style.cursor = 'pointer';
        clickLine.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('Delete this connection?')) {
                connections.splice(index, 1);
                updateConnections();
                saveArchitectureData();
            }
        });

        group.appendChild(clickLine);
        group.appendChild(polyline);
        connectionsLayer.appendChild(group);
    });
}

function deleteComponent(componentId) {
    if (confirm('Delete this component and all its connections?')) {
        const componentIndex = components.findIndex(c => c.id == componentId);
        if (componentIndex > -1) {
            components.splice(componentIndex, 1);
        }
        
        const componentDiv = document.querySelector(`[data-component-id="${componentId}"]`);
        if (componentDiv) {
            componentDiv.remove();
        }
        
        connections = connections.filter(conn => 
            conn.from.componentId != componentId && conn.to.componentId != componentId
        );
        
        updateConnections();
        
        if (selectedComponent && selectedComponent.id == componentId) {
            const propertiesPanel = document.getElementById('propertiesPanel');
            if (propertiesPanel) {
                propertiesPanel.style.display = 'none';
            }
            selectedComponent = null;
        }
        saveArchitectureData();
    }
}

function clearCanvas() {
    if (confirm('Are you sure you want to clear the entire canvas? This action cannot be undone.')) {
        components = [];
        connections = [];
        if (canvasContainer) {
            canvasContainer.querySelectorAll('.component-block').forEach(el => el.remove());
        }
        if (connectionsLayer) {
            connectionsLayer.innerHTML = '';
        }
        const propertiesPanel = document.getElementById('propertiesPanel');
        if (propertiesPanel) {
            propertiesPanel.style.display = 'none';
        }
        saveArchitectureData();
        showNotification('Canvas cleared!', 'info');
    }
}

var parameterConfig = {
    'Speed': {
        icon: '⚡',
        unit: 'RPM',
        min: 0,
        max: 3000,
        warningConditions: []
    },
    'Frequency': {
        icon: '🔄',
        unit: 'Hz',
        min: 0,
        max: 100,
        warningConditions: []
    },
    'DC Bus Voltage': {
        icon: '⚡',
        unit: 'V',
        min: 0,
        max: 600,
        warningConditions: []
    },
    'Output Current': {
        icon: '🔌',
        unit: 'A',
        min: 0,
        max: 50,
        warningConditions: []
    },
    'Output Voltage': {
        icon: '⚡',
        unit: 'V',
        min: 0,
        max: 500,
        warningConditions: []
    },
    'Temperature': {
        icon: '🌡️',
        unit: '°C',
        min: 0,
        max: 150,
        warningConditions: []
    }
};

var monitoringData = [];
var currentConfigId = null;
var alertHistory = {};
var autoProcess = false;
var lastDataTimestamp = null;
var outputMessages = [];
var showWarnings = true;
var showVariableName = true;

var allNotifications = [];
var warningCounts = {};
var criticalThreshold = 30;

const STORAGE_KEYS = {
    PARAMETER_CONFIG: 'cbm_parameter_config',
    MONITORING_DATA: 'cbm_monitoring_data',
    ALERT_HISTORY: 'cbm_alert_history',
    GLOBAL_SETTINGS: 'cbm_global_settings',
    NOTIFICATIONS: 'cbm_notifications',
    WARNING_COUNTS: 'cbm_warning_counts'
};

function saveArchitectureData() {
    try {
        const dataToSave = {
            components: components,
            connections: connections
        };
        if (typeof(Storage) !== "undefined") {
            localStorage.setItem('bosch_rexroth_architecture_data', JSON.stringify(dataToSave));
        }
        console.log('Architecture data saved to memory.');
    } catch (error) {
        console.error('Failed to save architecture data:', error);
    }
}

function loadArchitectureData() {
    try {
        if (typeof(Storage) !== "undefined") {
            const savedData = localStorage.getItem('bosch_rexroth_architecture_data');
            if (savedData) {
                const parsedData = JSON.parse(savedData);
                components = parsedData.components || [];
                connections = parsedData.connections || [];
                console.log('Architecture data loaded from memory.');
                return true;
            }
        }
    } catch (error) {
        console.error('Failed to load architecture data:', error);
    }
    return false;
}

function saveConfigurationToStorage() {
    try {
        if (typeof(Storage) !== "undefined") {
            localStorage.setItem(STORAGE_KEYS.PARAMETER_CONFIG, JSON.stringify(parameterConfig));
            
            const configData = monitoringData.map(item => ({
                id: item.id,
                name: item.name,
                icon: item.icon,
                unit: item.unit,
                min: item.min,
                max: item.max,
                warningConditions: item.warningConditions
            }));
            localStorage.setItem(STORAGE_KEYS.MONITORING_DATA, JSON.stringify(configData));
            
            const globalSettings = {
                showWarnings: showWarnings,
                showVariableName: showVariableName
            };
            localStorage.setItem(STORAGE_KEYS.GLOBAL_SETTINGS, JSON.stringify(globalSettings));
            
            localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(allNotifications.slice(0, 1000))); // Keep last 1000
            localStorage.setItem(STORAGE_KEYS.WARNING_COUNTS, JSON.stringify(warningCounts));
            
            const trimmedHistory = {};
            Object.keys(alertHistory).forEach(key => {
                trimmedHistory[key] = alertHistory[key].slice(0, 100);
            });
            localStorage.setItem(STORAGE_KEYS.ALERT_HISTORY, JSON.stringify(trimmedHistory));
        }
        
        console.log('Configuration saved to memory');
    } catch (error) {
        console.error('Error saving configuration:', error);
    }
}

function loadConfigurationFromStorage() {
    try {
        if (typeof(Storage) !== "undefined") {
            const savedParameterConfig = localStorage.getItem(STORAGE_KEYS.PARAMETER_CONFIG);
            if (savedParameterConfig) {
                const loadedConfig = JSON.parse(savedParameterConfig);
                Object.keys(parameterConfig).forEach(key => {
                    if (loadedConfig[key]) {
                        parameterConfig[key] = { ...parameterConfig[key], ...loadedConfig[key] };
                    }
                });
            }
            
            const savedGlobalSettings = localStorage.getItem(STORAGE_KEYS.GLOBAL_SETTINGS);
            if (savedGlobalSettings) {
                const settings = JSON.parse(savedGlobalSettings);
                showWarnings = settings.showWarnings !== undefined ? settings.showWarnings : true;
                showVariableName = settings.showVariableName !== undefined ? settings.showVariableName : true;
            }
            
            const savedNotifications = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
            if (savedNotifications) {
                allNotifications = JSON.parse(savedNotifications);
            }
            
            const savedWarningCounts = localStorage.getItem(STORAGE_KEYS.WARNING_COUNTS);
            if (savedWarningCounts) {
                warningCounts = JSON.parse(savedWarningCounts);
            }
            
            const savedAlertHistory = localStorage.getItem(STORAGE_KEYS.ALERT_HISTORY);
            if (savedAlertHistory) {
                alertHistory = JSON.parse(savedAlertHistory);
            }
        }
        
        console.log('Configuration loaded from memory');
        return true;
    } catch (error) {
        console.error('Error loading configuration:', error);
        return false;
    }
}

function initializeDashboard() {
    loadConfigurationFromStorage();
    if (monitoringData.length === 0) {
        initializeDefaultMonitoringData();
    }
    updateStatusCounts();

    setInterval(function() {
        if (autoProcess) {
            // Not relevant for real-time data layer connection
        }
        checkDataFreshness();
    }, 2000);
}

function updateMonitoringData(data) {
    if (monitoringData.length === 0) {
        if (typeof(Storage) !== "undefined") {
            const savedMonitoringData = localStorage.getItem(STORAGE_KEYS.MONITORING_DATA);
            
            if (savedMonitoringData) {
                try {
                    const loadedData = JSON.parse(savedMonitoringData);
                    loadedData.forEach(savedItem => {
                        const config = parameterConfig[savedItem.id] || parameterConfig[savedItem.name];
                        monitoringData.push({
                            id: savedItem.id,
                            name: savedItem.name,
                            icon: savedItem.icon || (config && config.icon) || '📊',
                            value: 0,
                            unit: savedItem.unit || (config && config.unit) || '',
                            min: savedItem.min !== undefined ? savedItem.min : (config && config.min) || 0,
                            max: savedItem.max !== undefined ? savedItem.max : (config && config.max) || 100,
                            warningConditions: savedItem.warningConditions || [],
                            status: 'normal',
                            history: []
                        });
                    });
                } catch (error) {
                    console.error('Error loading saved monitoring data:', error);
                    initializeDefaultMonitoringData();
                }
            } else {
                initializeDefaultMonitoringData();
            }
        } else {
            initializeDefaultMonitoringData();
        }
    }

    Object.keys(data).forEach(function(key) {
        if (key !== 'timestamp') {
            var existingParam = monitoringData.find(function(item) {
                return item.id === key;
            });

            if (existingParam) {
                var newValue = parseFloat(data[key]);
                existingParam.value = newValue;
                existingParam.history.push(newValue);

                if (existingParam.history.length > 10) {
                    existingParam.history.shift();
                }

                updateItemStatus(existingParam);
            }
        }
    });
}

function initializeDefaultMonitoringData() {
    Object.keys(parameterConfig).forEach(function(key) {
        var config = parameterConfig[key];
        monitoringData.push({
            id: key,
            name: key,
            icon: config.icon,
            value: 0,
            unit: config.unit,
            min: config.min,
            max: config.max,
            warningConditions: config.warningConditions || [],
            status: 'normal',
            history: []
        });
    });
}

function updateItemStatus(item) {
    var previousStatus = item.status;
    var newStatus = 'normal';

    // ✅ Tambahkan pengecekan anti duplikasi
    if (item.lastValue !== undefined && item.value === item.lastValue && 
        (item.status === 'warning' || item.status === 'critical')) {
        return; // skip duplicate warning/critical jika value sama
    }
    item.lastValue = item.value; // simpan nilai terakhir

    let isWarning = false;
    if (item.value < item.min || item.value > item.max) {
        isWarning = true;
    } else if (item.warningConditions && item.warningConditions.length > 0) {
        for (var i = 0; i < item.warningConditions.length; i++) {
            var condition = item.warningConditions[i];
            if (evaluateCondition(item.value, condition.operator, condition.value)) {
                isWarning = true;
                break;
            }
        }
    }
    
    if (isWarning) {
        const warningNotification = {
            id: Date.now() + Math.random(),
            timestamp: new Date().toISOString(),
            type: 'warning',
            parameter: item.name,
            value: item.value,
            unit: item.unit,
            message: `${item.name} masih dalam kondisi warning: ${item.value}${item.unit}`,
            status: 'active',
            severity: 'warning'
        };
        addNotification(warningNotification);

        if (!warningCounts[item.id]) {
            warningCounts[item.id] = 0;
        }
        warningCounts[item.id]++;

        if (warningCounts[item.id] >= criticalThreshold) {
            triggerCriticalAlert(item);
            warningCounts[item.id] = 0; // reset setelah critical
        } else {
            if (item.status !== 'critical') {
                item.status = 'warning';
            }
        }

    } else {
        if (previousStatus === 'warning' || previousStatus === 'critical') {
            handleWarningResolution(item);
        }
        item.status = 'normal';
    }

    if (item.status !== previousStatus) {
        generateAlert(item, previousStatus, item.status);
        if (!alertHistory[item.id]) {
            alertHistory[item.id] = [];
        }
        alertHistory[item.id].unshift({
            time: new Date().toLocaleTimeString(),
            message: 'Status changed from ' + previousStatus + ' to ' + item.status +
                ' (Value: ' + item.value + item.unit + ')',
            oldStatus: previousStatus,
            newStatus: item.status
        });

        if (alertHistory[item.id].length > 20) {
            alertHistory[item.id] = alertHistory[item.id].slice(0, 20);
        }
    }
}

function evaluateCondition(value, operator, threshold) {
    switch (operator) {
        case '>': return value > threshold;
        case '<': return value < threshold;
        case '>=': return value >= threshold;
        case '<=': return value <= threshold;
        case '==': return value == threshold;
        case '!=': return value != threshold;
        default: return false;
    }
}

function handleWarning(item) {
    if (!warningCounts[item.id]) {
        warningCounts[item.id] = 0;
    }
    warningCounts[item.id]++;
    
    const warningNotification = {
        id: Date.now() + Math.random(),
        timestamp: new Date().toISOString(),
        type: 'warning',
        parameter: item.name,
        value: item.value,
        unit: item.unit,
        message: `${item.name} warning: ${item.value}${item.unit}`,
        status: 'active',
        severity: 'warning'
    };
    addNotification(warningNotification);
    
    if (warningCounts[item.id] >= criticalThreshold) {
        triggerCriticalAlert(item);
        warningCounts[item.id] = 0;
    }
    
    generateAlert(item, 'normal', 'warning');
}

function handleWarningResolution(item) {
    if (warningCounts[item.id]) {
        warningCounts[item.id] = 0;
    }
    
    const resolutionNotification = {
        id: Date.now() + Math.random(),
        timestamp: new Date().toISOString(),
        type: 'info',
        parameter: item.name,
        value: item.value,
        unit: item.unit,
        message: `${item.name} returned to normal: ${item.value}${item.unit}`,
        status: 'resolved',
        severity: 'info'
    };
    
    addNotification(resolutionNotification);
}

function triggerCriticalAlert(item) {
    const oldStatus = item.status;
    item.status = 'critical';

    const criticalMessage = "⚠️ " + item.name + " sudah bermasalah terus-menerus, segera lakukan pemeriksaan!";

    generateAlert(item, oldStatus, 'critical', criticalMessage);

    const criticalNotification = {
        id: Date.now() + Math.random(),
        timestamp: new Date().toISOString(),
        type: 'critical',
        parameter: item.name,
        value: item.value,
        unit: item.unit,
        message: criticalMessage,
        status: 'active',
        severity: 'critical'
    };
    addNotification(criticalNotification);
}

function generateCriticalMessage(item) {
    const parameterName = item.name.toLowerCase();
    
    if (parameterName.includes('speed') || parameterName.includes('rpm')) {
        return `Kecepatan pada motor sudah bermasalah secara terus menerus. Segera lakukan pemeriksaan sistem drive motor.`;
    } else if (parameterName.includes('temperature') || parameterName.includes('temp')) {
        return `Suhu sistem sudah bermasalah secara terus menerus. Segera lakukan pemeriksaan sistem pendingin.`;
    } else if (parameterName.includes('voltage') || parameterName.includes('volt')) {
        return `Tegangan sistem sudah bermasalah secara terus menerus. Segera lakukan pemeriksaan suplai listrik.`;
    } else if (parameterName.includes('current') || parameterName.includes('ampere')) {
        return `Arus sistem sudah bermasalah secara terus menerus. Segera lakukan pemeriksaan beban sistem.`;
    } else if (parameterName.includes('frequency') || parameterName.includes('freq')) {
        return `Frekuensi sistem sudah bermasalah secara terus menerus. Segera lakukan pemeriksaan kontrol frekuensi.`;
    } else {
        return `Parameter ${item.name} sudah bermasalah secara terus menerus. Segera lakukan pemeriksaan sistem.`;
    }
}

function addNotification(notification) {
    allNotifications.unshift(notification);
    
    if (allNotifications.length > 1000) {
        allNotifications = allNotifications.slice(0, 1000);
    }
    
    updateNotificationStats();
    if (document.getElementById('notificationsSection').classList.contains('active')) {
        renderNotifications();
    }
    
    saveConfigurationToStorage();
}

function generateAlert(item, oldStatus, newStatus, customMessage = null) {
    var alertMessage = {
        timestamp: new Date().toISOString(),
        parameter: item.name,
        value: item.value,
        unit: item.unit,
        status: newStatus,
        oldStatus: oldStatus,
        message: customMessage || 
                (item.name + ': ' + item.value + item.unit + ' - Status: ' + newStatus.toUpperCase())
    };

    if (newStatus === 'critical') {
        const now = Date.now();
        const lastSent = lastCriticalSent[item.id] || 0;
        if (now - lastSent > 30000) {
            if (mqttClient && mqttClient.connected) {
                mqttClient.publish(TOPIC_CRITICAL, JSON.stringify(alertMessage), { qos: 1 });
                console.log("Critical alert published via MQTT:", alertMessage);
                lastCriticalSent[item.id] = now;
            } else {
                console.error("MQTT not connected, failed to send alert:", alertMessage);
            }
        } else {
            console.log("Critical alert suppressed to avoid spam:", item.name);
        }
    }

    outputMessages.unshift(alertMessage);
    if (outputMessages.length > 50) {
        outputMessages = outputMessages.slice(0, 50);
    }
    updateOutputDisplay();

    if ((showWarnings && newStatus === 'warning') || newStatus === 'critical') {
        var outputSection = document.getElementById('outputSection');
        if (outputSection) {
            outputSection.style.display = 'block';
        }
    }
    console.log('CBM_ALERT:', JSON.stringify(alertMessage));
}

function renderNotifications() {
    const container = document.getElementById('notificationsContainer');
    const noNotifications = document.getElementById('noNotifications');
    
    if (!container) return;
    
    const filterValue = document.getElementById('notificationFilter') ? 
        document.getElementById('notificationFilter').value : 'all';
    
    let filteredNotifications = allNotifications;
    if (filterValue !== 'all') {
        filteredNotifications = allNotifications.filter(n => n.type === filterValue);
    }
    
    if (filteredNotifications.length === 0) {
        if (noNotifications) noNotifications.style.display = 'block';
        container.innerHTML = '';
        return;
    }
    
    if (noNotifications) noNotifications.style.display = 'none';
    
    container.innerHTML = filteredNotifications.map(notification => {
        const timeStr = new Date(notification.timestamp).toLocaleString();
        const icon = getNotificationIcon(notification.type);
        
        return `
            <div class="notification-item ${notification.type}" data-id="${notification.id}">
                <div class="notification-header">
                    <div class="notification-title">
                        ${icon} ${notification.type.toUpperCase()}
                    </div>
                    <div class="notification-time">${timeStr}</div>
                </div>
                <div class="notification-message">${notification.message}</div>
                <div class="notification-details">
                    <div class="notification-parameter">
                        Parameter: <span class="notification-value">${notification.parameter}</span>
                    </div>
                    <div class="notification-parameter">
                        Value: <span class="notification-value">${notification.value}${notification.unit}</span>
                    </div>
                    ${notification.warningCount ? `<div class="notification-parameter">
                        Warning Count: <span class="notification-value">${notification.warningCount}</span>
                    </div>` : ''}
                </div>
                <div class="notification-actions">
                    ${notification.status === 'active' ? 
                        '<button class="notification-btn resolve" onclick="resolveNotification(\'' + notification.id + '\')">Mark Resolved</button>' : 
                        '<span style="color: #10b981; font-size: 12px;">✅ Resolved</span>'
                    }
                    <button class="notification-btn dismiss" onclick="dismissNotification('${notification.id}')">Dismiss</button>
                </div>
            </div>
        `;
    }).join('');
}

function getNotificationIcon(type) {
    switch (type) {
        case 'critical': return '🚨';
        case 'warning': return '⚠️';
        case 'resolved': return '✅';
        default: return '📢';
    }
}

function updateNotificationStats() {
    const stats = {
        critical: 0,
        warning: 0,
        resolved: 0
    };
    
    allNotifications.forEach(notification => {
        if (notification.status === 'resolved' || notification.type === 'resolved') {
            stats.resolved++;
        } else {
            stats[notification.type] = (stats[notification.type] || 0) + 1;
        }
    });
    
    const elements = {
        totalCritical: document.getElementById('totalCritical'),
        totalWarnings: document.getElementById('totalWarnings'),
        totalResolved: document.getElementById('totalResolved')
    };
    
    if (elements.totalCritical) elements.totalCritical.textContent = stats.critical;
    if (elements.totalWarnings) elements.totalWarnings.textContent = stats.warning;
    if (elements.totalResolved) elements.totalResolved.textContent = stats.resolved;
    
    const monitoringStats = { normal: 0, warning: 0, critical: 0 };
    monitoringData.forEach(function(item) {
        monitoringStats[item.status]++;
    });

    const normalCount = document.getElementById('normalCount');
    const warningCount = document.getElementById('warningCount');
    const criticalCount = document.getElementById('criticalCount');
    
    if (normalCount) normalCount.textContent = monitoringStats.normal + ' Normal';
    if (warningCount) warningCount.textContent = monitoringStats.warning + ' Warning';
    if (criticalCount) criticalCount.textContent = monitoringStats.critical + ' Critical';
}

function filterNotifications() {
    renderNotifications();
}

function resolveNotification(notificationId) {
    const notification = allNotifications.find(n => n.id == notificationId);
    if (notification) {
        notification.status = 'resolved';
        notification.type = 'resolved';
        saveConfigurationToStorage();
        renderNotifications();
        updateNotificationStats();
    }
}

function dismissNotification(notificationId) {
    const index = allNotifications.findIndex(n => n.id == notificationId);
    if (index > -1) {
        allNotifications.splice(index, 1);
        saveConfigurationToStorage();
        renderNotifications();
        updateNotificationStats();
    }
}

function clearAllNotifications() {
    if (confirm('Are you sure you want to clear all notifications? This action cannot be undone.')) {
        allNotifications = [];
        warningCounts = {};
        saveConfigurationToStorage();
        renderNotifications();
        updateNotificationStats();
        showNotification('All notifications cleared!', 'info');
    }
}

function exportAllConfiguration() {
    try {
        const exportData = {
            architecture: {
                components: components,
                connections: connections
            },
            cbm: {
                parameterConfig: parameterConfig,
                monitoringData: monitoringData.map(item => ({
                    id: item.id,
                    name: item.name,
                    icon: item.icon,
                    unit: item.unit,
                    min: item.min,
                    max: item.max,
                    warningConditions: item.warningConditions
                })),
                globalSettings: {
                    showWarnings: showWarnings,
                    showVariableName: showVariableName
                },
                alertHistory: alertHistory
            },
            exportDate: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'cbm_full_configuration_' + new Date().toISOString().split('T')[0] + '.json';
        a.click();
        URL.revokeObjectURL(url);

        showNotification('All configuration exported successfully!', 'success');
    } catch (error) {
        console.error('Error exporting all configuration:', error);
        showNotification('Error exporting configuration', 'error');
    }
}

function importAllConfiguration(file) {
    try {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const importData = JSON.parse(e.target.result);

                if (importData.architecture) {
                    components = importData.architecture.components || [];
                    connections = importData.architecture.connections || [];
                    if (canvasContainer) {
                        canvasContainer.querySelectorAll('.component-block').forEach(el => el.remove());
                    }
                    if (connectionsLayer) {
                        connectionsLayer.innerHTML = '';
                    }
                    components.forEach(renderComponent);
                    updateConnections();
                }

                if (importData.cbm) {
                    if (importData.cbm.parameterConfig) parameterConfig = importData.cbm.parameterConfig;
                    if (importData.cbm.globalSettings) {
                        showWarnings = importData.cbm.globalSettings.showWarnings;
                        showVariableName = importData.cbm.globalSettings.showVariableName;
                    }
                    if (importData.cbm.alertHistory) alertHistory = importData.cbm.alertHistory;

                    monitoringData = [];
                    if (importData.cbm.monitoringData) {
                        importData.cbm.monitoringData.forEach(savedItem => {
                            monitoringData.push({
                                id: savedItem.id,
                                name: savedItem.name,
                                icon: savedItem.icon,
                                value: 0,
                                unit: savedItem.unit,
                                min: savedItem.min,
                                max: savedItem.max,
                                warningConditions: savedItem.warningConditions || [],
                                status: 'normal',
                                history: []
                            });
                        });
                    } else {
                        initializeDefaultMonitoringData();
                    }
                }

                saveConfigurationToStorage();
                saveArchitectureData();
                renderDashboard();
                updateStatusCounts();

                showNotification('All configuration imported successfully!', 'success');
            } catch (parseError) {
                console.error('Error parsing import file:', parseError);
                showNotification('Error parsing configuration file', 'error');
            }
        };
        reader.readAsText(file);
    } catch (error) {
        console.error('Error importing configuration:', error);
        showNotification('Error importing configuration', 'error');
    }
}

function updateStatusCounts() {
    updateNotificationStats();
}

function updateConnectionStatus(connected) {
    var dot = document.getElementById('connectionDot');
    var status = document.getElementById('connectionStatus');
    
    if (!dot || !status) return;

    if (connected) {
        dot.classList.remove('offline');
        status.textContent = 'Connected - Receiving Data';
    } else {
        dot.classList.add('offline');
        status.textContent = 'Disconnected - No Data';
    }
}

function checkDataFreshness() {
    if (lastDataTimestamp) {
        var now = new Date();
        var lastUpdate = new Date(lastDataTimestamp);
        var timeDiff = (now - lastUpdate) / 1000;

        if (timeDiff > 30) {
            updateConnectionStatus(false);
        }
    }
}

function renderDashboard() {
    var grid = document.getElementById('dashboardGrid');
    if (!grid) return;
    
    grid.innerHTML = '';

    if (monitoringData.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #fff; padding: 40px;">No data available. Waiting for real-time data...</div>';
        return;
    }

    monitoringData.forEach(function(item) {
        var card = createMonitoringCard(item);
        grid.appendChild(card);
    });
}

function createMonitoringCard(item) {
    var card = document.createElement('div');
    card.className = 'monitoring-card status-' + item.status;
    card.onclick = function() { openConfigModal(item); };

    var chartBars = item.history.map(function(val) {
        var height = Math.max(5, ((val - item.min) / (item.max - item.min)) * 100);
        if (isNaN(height)) height = 5;
        return '<div class="chart-bar" style="height: ' + height + '%"></div>';
    }).join('');

    var displayName = showVariableName ? item.name : '';

    card.innerHTML =
        '<div class="card-header">' +
            '<div class="card-title">' + displayName + '</div>' +
            '<div class="card-icon">' + item.icon + '</div>' +
        '</div>' +
        '<div class="card-content">' +
            '<div class="metric-row">' +
                '<div class="metric-label">Current Value</div>' +
                '<div class="metric-value">' +
                    item.value +
                    '<span class="metric-unit">' + item.unit + '</span>' +
                '</div>' +
            '</div>' +
            '<div class="mini-chart">' +
                (chartBars || '<div style="text-align: center; color: #5f7f96; font-size: 12px;">No history</div>') +
            '</div>' +
        '</div>';

    return card;
}

function updateLastUpdate(timestamp) {
    var lastUpdateElement = document.getElementById('lastUpdate');
    if (!lastUpdateElement) return;
    
    if (timestamp) {
        lastDataTimestamp = timestamp;
        var updateTime = new Date(timestamp).toLocaleTimeString();
        lastUpdateElement.textContent = updateTime;
    } else {
        lastUpdateElement.textContent = new Date().toLocaleTimeString();
    }
}

function updateOutputDisplay() {
    var outputContent = document.getElementById('outputContent');
    if (!outputContent) return;

    if (outputMessages.length === 0) {
        outputContent.innerHTML = '<div style="color: #5f7f96; text-align: center; padding: 20px;">No warnings</div>';
        return;
    }

    outputContent.innerHTML = outputMessages.map(function(msg) {
        return '<div class="output-message ' + msg.status + '">' +
            '<div><strong>' + msg.parameter + '</strong>: ' + msg.value + msg.unit + '</div>' +
            '<div>Status: ' + msg.status.toUpperCase() + '</div>' +
            '<div class="output-timestamp">' + new Date(msg.timestamp).toLocaleString() + '</div>' +
            '</div>';
    }).join('');
}

function clearAlerts() {
    outputMessages = [];
    updateOutputDisplay();
    var outputSection = document.getElementById('outputSection');
    if (outputSection) {
        outputSection.style.display = 'none';
    }
}

function openConfigModal(item) {
    currentConfigId = item.id;
    var modal = document.getElementById('configModal');
    if (!modal) return;

    var header = modal.querySelector('.modal-header');
    var statusColors = {
        normal: '#4caf50',
        warning: '#ff9800',
        critical: '#f44336'
    };
    header.style.background = statusColors[item.status];

    document.getElementById('modalTitle').textContent = 'Widget Settings';
    document.getElementById('parameterLabel').textContent = item.name;
    document.getElementById('minValue').value = item.min;
    document.getElementById('maxValue').value = item.max;
    document.getElementById('showWarnings').checked = showWarnings;
    document.getElementById('showVariableName').checked = showVariableName;

    window.tempConditions = (item.warningConditions || []).map(function(condition) {
        return {
            operator: condition.operator,
            value: condition.value,
            id: condition.id || Date.now()
        };
    });
    document.getElementById('conditionEnabled').checked = false;
    document.getElementById('conditionOperator').value = '>';
    document.getElementById('conditionValue').value = '';

    setTimeout(function() {
        createConditionsContainer();
        renderConditionsList();
    }, 100);

    var alertHistoryDiv = document.getElementById('alertHistory');
    var alerts = alertHistory[item.id] || [];

    if (alerts.length === 0) {
        alertHistoryDiv.innerHTML = '<div style="color: #5f7f96; text-align: center; padding: 20px;">No warnings recorded</div>';
    } else {
        alertHistoryDiv.innerHTML = alerts.map(function(alert) {
            return '<div class="alert-item">' +
                '<span class="alert-message">' + alert.message + '</span>' +
                '<span class="alert-time">' + alert.time + '</span>' +
                '</div>';
        }).join('');
    }

    modal.style.display = 'block';
}

function closeModal() {
    var modal = document.getElementById('configModal');
    if (modal) {
        modal.style.display = 'none';
    }
    currentConfigId = null;
    window.tempConditions = [];
    
    var conditionsContainer = document.getElementById('conditionsContainer');
    if (conditionsContainer && conditionsContainer.parentNode) {
        conditionsContainer.parentNode.parentNode.removeChild(conditionsContainer.parentNode);
    }
}

function addCondition() {
    var operator = document.getElementById('conditionOperator').value;
    var value = parseFloat(document.getElementById('conditionValue').value);
    
    if (isNaN(value)) {
        showNotification('Please enter a valid number for condition value', 'error');
        return;
    }

    var newCondition = {
        operator: operator,
        value: value,
        id: Date.now()
    };

    if (!window.tempConditions) {
        window.tempConditions = [];
    }
    window.tempConditions.push(newCondition);
    document.getElementById('conditionValue').value = '';
    renderConditionsList();
    showNotification('Condition added: If value is ' + operator + ' ' + value, 'success');
}

function renderConditionsList() {
    var conditionsContainer = document.getElementById('conditionsContainer');
    if (!conditionsContainer) {
        createConditionsContainer();
        conditionsContainer = document.getElementById('conditionsContainer');
    }
    
    var conditions = window.tempConditions || [];
    
    if (conditions.length === 0) {
        conditionsContainer.innerHTML = '<div style="color: #94a3b8; text-align: center; padding: 10px; font-style: italic;">No conditions added</div>';
        return;
    }
    
    conditionsContainer.innerHTML = conditions.map(function(condition, index) {
        return '<div class="condition-row" style="background: rgba(34, 197, 94, 0.1); border-left-color: #22c55e;">' +
            '<input type="checkbox" class="condition-checkbox" checked disabled>' +
            '<span class="condition-text">If value is ' + condition.operator + ' ' + condition.value + '</span>' +
            '<button class="btn-danger" style="padding: 4px 8px; font-size: 12px; border-radius: 4px;" onclick="removeCondition(' + index + ')">Remove</button>' +
            '</div>';
    }).join('');
}

function removeCondition(index) {
    if (window.tempConditions && window.tempConditions[index]) {
        var removedCondition = window.tempConditions[index];
        window.tempConditions.splice(index, 1);
        renderConditionsList();
        showNotification('Condition removed: If value is ' + removedCondition.operator + ' ' + removedCondition.value, 'info');
    }
}

function createConditionsContainer() {
    var addConditionBtn = document.querySelector('.add-condition-btn');
    if (!addConditionBtn) return;
    
    var addConditionSection = addConditionBtn.parentNode.parentNode;
    var conditionsListSection = document.createElement('div');
    conditionsListSection.className = 'setting-item';
    conditionsListSection.innerHTML = 
        '<div style="margin-bottom: 10px; font-size: 14px; color: #f1f5f9;">Active Conditions:</div>' +
        '<div id="conditionsContainer" style="max-height: 150px; overflow-y: auto;"></div>';
    
    addConditionSection.parentNode.insertBefore(conditionsListSection, addConditionSection.nextSibling);
}

function saveConfiguration() {
    if (!currentConfigId) return;

    var item = monitoringData.find(function(i) {
        return i.id === currentConfigId;
    });
    if (!item) return;

    var newMin = parseFloat(document.getElementById('minValue').value);
    var newMax = parseFloat(document.getElementById('maxValue').value);
    
    showWarnings = document.getElementById('showWarnings').checked;
    showVariableName = document.getElementById('showVariableName').checked;

    if (!isNaN(newMin)) item.min = newMin;
    if (!isNaN(newMax)) item.max = newMax;

    item.warningConditions = window.tempConditions || [];

    if (parameterConfig[item.id]) {
        parameterConfig[item.id].min = item.min;
        parameterConfig[item.id].max = item.max;
        parameterConfig[item.id].warningConditions = item.warningConditions;
    }

    updateItemStatus(item);
    renderDashboard();
    updateStatusCounts();

    if (!alertHistory[item.id]) {
        alertHistory[item.id] = [];
    }
    alertHistory[item.id].unshift({
        time: new Date().toLocaleTimeString(),
        message: 'Configuration updated - Range: ' + item.min + '-' + item.max + 
                ', Conditions: ' + item.warningConditions.length,
        oldStatus: item.status,
        newStatus: item.status
    });
    saveConfigurationToStorage();

    closeModal();
    showNotification('Configuration saved successfully!', 'success');
}

function receiveNodeRedData(data) {
    if (data && typeof data === 'object') {
        updateMonitoringData(data);
        updateConnectionStatus(true);
        renderDashboard();
        updateStatusCounts();
        updateLastUpdate(data.timestamp);
    }
}

function establishDataConnection() {
    function fetchData() {
        const mqttClient = mqtt.connect("wss://broker.hivemq.com:8884/mqtt");

        mqttClient.on("connect", () => {
            console.log("Connected to HiveMQ broker");
            mqttClient.subscribe(TOPIC_METRICS, { qos: 1 }, (err) => {
                if (err) {
                    console.error("Failed to subscribe:", err);
                } else {
                    console.log("Subscribed");
                }
            });
        });

        mqttClient.on("message", (topic, message) => {
            try {
                if (topic === TOPIC_METRICS) {
                    const dataObj = JSON.parse(message.toString());
                    dataObj.timestamp = new Date().toISOString();
                    receiveNodeRedData(dataObj);
                    updateConnectionStatus(true);
                }
            } catch (err) {
                console.error("Error parsing MQTT message:", err);
            }
        });

        // const baseUrl = 'https://100.96.1.2/node-red/api/cbm/metrics'; 
        
        // return fetch(baseUrl)
        //     .then(res => {
        //         if (!res.ok) throw new Error("HTTP " + res.status);
        //         return res.json();
        //     })
        //     .then(dataObj => {
        //         dataObj.timestamp = new Date().toISOString();
        //         receiveNodeRedData(dataObj);
        //         updateConnectionStatus(true);
        //     })
        //     .catch(err => {
        //         console.error('❌ Error fetching data from Node-RED:', err);
        //         updateConnectionStatus(false);
        //     });
    }
    setInterval(fetchData, 2000);
}

function showNotification(message, type) {
    var notification = document.createElement('div');
    var bgColor = {
        success: '#4caf50',
        error: '#f44336',
        warning: '#ff9800'
    };

    notification.style.cssText =
        'position: fixed;' +
        'top: 20px;' +
        'right: 20px;' +
        'padding: 15px 20px;' +
        'background: ' + (bgColor[type] || '#142c46') + ';' +
        'color: white;' +
        'border-radius: 8px;' +
        'z-index: 2000;' +
        'animation: slideIn 0.3s ease;' +
        'box-shadow: 0 4px 12px rgba(0,0,0,0.3);' +
        'max-width: 350px;' +
        'font-size: 14px;' +
        'line-height: 1.4;';
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(function() {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(function() {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 4000);
}

function getSystemStatus() {
    var systemStatus = {
        timestamp: new Date().toISOString(),
        parameters: monitoringData.map(function(item) {
            return {
                name: item.name,
                value: item.value,
                unit: item.unit,
                status: item.status,
                warningConditions: item.warningConditions,
                min: item.min,
                max: item.max
            };
        }),
        summary: {
            normal: monitoringData.filter(function(item) { return item.status === 'normal'; }).length,
            warning: monitoringData.filter(function(item) { return item.status === 'warning'; }).length,
            critical: monitoringData.filter(function(item) { return item.status === 'critical'; }).length,
            total: monitoringData.length
        },
        alerts: outputMessages.slice(0, 10),
        notifications: allNotifications.slice(0, 20)
    };

    console.log('CBM_STATUS:', JSON.stringify(systemStatus));
    return systemStatus;
}

document.addEventListener('click', (e) => {
    if (canvasContainer && (e.target === canvasContainer || e.target === canvas)) {
        document.querySelectorAll('.component-block').forEach(el => {
            el.classList.remove('selected');
        });
        const propertiesPanel = document.getElementById('propertiesPanel');
        if (propertiesPanel) {
            propertiesPanel.style.display = 'none';
        }
        selectedComponent = null;
    }
});

window.onclick = function(event) {
    var modal = document.getElementById('configModal');
    if (modal && event.target === modal) {
        closeModal();
    }
};

document.addEventListener('DOMContentLoaded', function() {
    console.log('Industrial Dashboard Suite loaded successfully');
    console.log('Loading saved configurations...');
    loadConfigurationFromStorage();
    
    if (loadArchitectureData()) {
        components.forEach(renderComponent);
        updateConnections();
    }
    
    window.addEventListener('resize', () => {
        if (document.getElementById('architectureSection').classList.contains('active')) {
            resizeCanvas();
        }
    });
    
    initializeArchitecture();
    showArchitecture();
    
    setInterval(function() {
        if (document.getElementById('monitoringSection').classList.contains('active')) {
            getSystemStatus();
        }
    }, 30000);

    setInterval(function() {
        if (monitoringData.length > 0) {
            saveConfigurationToStorage();
        }
        if (components.length > 0 || connections.length > 0) {
            saveArchitectureData();
        }
        console.log('Auto-saved configurations for both sections.');
    }, 300000);
    
    setTimeout(function() {
        const hasShownNotification = localStorage.getItem('cbm_welcome_shown');
        if (!hasShownNotification) {
            showNotification('Welcome! Your widget configurations and architecture diagrams will now be saved automatically and persist after page refresh.', 'info');
            localStorage.setItem('cbm_welcome_shown', 'true');
        }
    }, 2000);
});
