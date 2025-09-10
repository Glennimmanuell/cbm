function getAllMonitoringData() {
    return Object.values(monitoringDataByMotor).flat();
}

function showArchitecture() {
    document.getElementById('architectureSection').classList.add('active');
    document.getElementById('monitoringSection').classList.remove('active');
    document.getElementById('notificationsSection').classList.remove('active');
    document.getElementById('historySection').classList.remove('active');
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    
    const archBtn = document.querySelector('.nav-btn[onclick*="showArchitecture"]') || document.querySelectorAll('.nav-btn')[0];
    if (archBtn) archBtn.classList.add('active');
    
    setTimeout(() => {
        resizeCanvas();
    }, 100);
}

function showMonitoring() {
    document.getElementById('architectureSection').classList.remove('active');
    document.getElementById('monitoringSection').classList.add('active');
    document.getElementById('notificationsSection').classList.remove('active');
    document.getElementById('historySection').classList.remove('active');
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    
    const monBtn = document.querySelector('.nav-btn[onclick*="showMonitoring"]') || document.querySelectorAll('.nav-btn')[1];
    if (monBtn) monBtn.classList.add('active');
    
    setTimeout(() => {
        initializeDashboard();
        establishDataConnection();
    }, 100);
}

function showNotifications() {
    document.getElementById('architectureSection').classList.remove('active');
    document.getElementById('monitoringSection').classList.remove('active');
    document.getElementById('notificationsSection').classList.add('active');
    document.getElementById('historySection').classList.remove('active');
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    
    const notifBtn = document.querySelector('.nav-btn[onclick*="showNotifications"]') || document.querySelectorAll('.nav-btn')[2];
    if (notifBtn) notifBtn.classList.add('active');
    
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
let ruleAlertCounters = {}; 

const TOPIC_METRICS = "dd2d15b7eb993965d64d1aa35e51a369";
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
    'Sensor': '📡', 'Actuator': '⚙️', 'Motor': '🛠', 'PLC': '🏭', 'HMI': '🖥️', 
    'Safety': '🦺', 'Gateway': '🌐', 'Switch': '🔀', 'Router': '📶','Cloud': '☁️', 
    'Analytics': '📊', 'Dashboard': '📈'
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
    'Speed': { icon: '🏎️', unit: 'RPM', min: 0, max: 3000 },
    'Frequency': { icon: '📡', unit: 'Hz', min: 0, max: 100 },
    'DC Bus Voltage': { icon: '⚡', unit: 'V', min: 0, max: 600 },
    'Output Current': { icon: '🔌', unit: 'A', min: 0, max: 50 },
    'Output Voltage': { icon: '🔋', unit: 'V', min: 0, max: 500 },
    'Temperature': { icon: '🌡️', unit: '°C', min: 0, max: 150 }
};

var monitoringDataByMotor = {};
var globalThresholdRules = [];
var globalCriticalThresholds = [];
var allNotifications = [];
var lastDataTimestamp = null;
var outputMessages = [];

const STORAGE_KEYS = {
    PARAMETER_CONFIG: 'cbm_parameter_config',
    MONITORING_DATA: 'cbm_monitoring_data',
    GLOBAL_THRESHOLD_RULES: 'cbm_global_threshold_rules',
    GLOBAL_CRITICAL_THRESHOLDS: 'cbm_global_critical_thresholds',
    NOTIFICATIONS: 'cbm_notifications'
};

function saveArchitectureData() {
    try {
        const dataToSave = {
            components: components,
            connections: connections
        };
        localStorage.setItem('cbm_architecture', JSON.stringify(dataToSave));
        console.log('Architecture data saved to localStorage');
    } catch (error) {
        console.error('Failed to save architecture data:', error);
    }
}

function loadArchitectureData() {
    try {
        const saved = localStorage.getItem('cbm_architecture');
        if (saved) {
            const parsed = JSON.parse(saved);
            components = parsed.components || [];
            connections = parsed.connections || [];
            console.log('Architecture data loaded from localStorage');
            return true;
        }
    } catch (error) {
        console.error('Failed to load architecture data:', error);
    }
    return false;
}

function saveConfigurationToStorage() {
    try {
        const config = {
            parameterConfig: parameterConfig,
            monitoringDataByMotor: monitoringDataByMotor,
            globalThresholdRules: globalThresholdRules,
            globalCriticalThresholds: globalCriticalThresholds,
            allNotifications: allNotifications,
            ruleAlertCounters: ruleAlertCounters,
            lastCriticalSent: lastCriticalSent
        };
        localStorage.setItem(STORAGE_KEYS.PARAMETER_CONFIG, JSON.stringify(config));
        console.log('Configuration saved to localStorage');
    } catch (error) {
        console.error('Error saving configuration:', error);
    }
}

function loadConfigurationFromStorage() {
    try {
        const saved = localStorage.getItem(STORAGE_KEYS.PARAMETER_CONFIG);
        if (saved) {
            const parsed = JSON.parse(saved);
            parameterConfig = parsed.parameterConfig || parameterConfig;
            monitoringDataByMotor = parsed.monitoringDataByMotor || {};
            globalThresholdRules = parsed.globalThresholdRules || [];
            globalCriticalThresholds = parsed.globalCriticalThresholds || [];
            allNotifications = parsed.allNotifications || [];
            ruleAlertCounters = parsed.ruleAlertCounters || {};
            lastCriticalSent = parsed.lastCriticalSent || {};
            console.log('Configuration loaded from localStorage');
            
            if (Object.keys(monitoringDataByMotor).length > 0) {
                renderDashboard();
                refreshMotorDropdown();
                updateNotificationStats();
            }
            
            return true;
        }
    } catch (error) {
        console.error('Error loading configuration:', error);
    }
    return false;
}

function initializeDashboard() {
    const configLoaded = loadConfigurationFromStorage();
    if (!configLoaded || Object.keys(monitoringDataByMotor).length === 0) {
        initializeDefaultMonitoringData("Motor_1");
        initializeDefaultMonitoringData("Motor_2");
    }
    
    updateStatusCounts();
    renderDashboard();
    refreshMotorDropdown();

    setInterval(function() {
        checkDataFreshness();
    }, 2000);
    
    setInterval(function() {
        saveConfigurationToStorage();
    }, 30000);
}

function initializeDefaultMonitoringData(motorName = "Default") {
    Object.keys(parameterConfig).forEach(function(key) {
        var config = parameterConfig[key];
        monitoringDataByMotor[motorName] = monitoringDataByMotor[motorName] || [];
        monitoringDataByMotor[motorName].push({
            id: `${motorName}.${key}`,
            name: `${motorName} - ${key}`,
            icon: config.icon,
            value: 0,
            unit: config.unit,
            min: config.min,
            max: config.max,
            status: 'normal',
            history: []
        });
    });
}

function updateMonitoringData(data) {
    const motorName = data.Name || "Unknown";
    if (!monitoringDataByMotor[motorName]) {
        monitoringDataByMotor[motorName] = [];
        Object.keys(parameterConfig).forEach(key => {
            monitoringDataByMotor[motorName].push({
                id: `${motorName}.${key}`,
                name: `${motorName} - ${key}`,
                icon: parameterConfig[key].icon,
                value: 0,
                unit: parameterConfig[key].unit,
                min: parameterConfig[key].min,
                max: parameterConfig[key].max,
                status: "normal",
                history: []
            });
        });
        refreshMotorDropdown();
    }

    Object.keys(data).forEach(key => {
        if (key !== "timestamp" && key !== "Name") {
            const param = monitoringDataByMotor[motorName].find(item => item.id === `${motorName}.${key}`);
            if (param) {
                const newValue = parseFloat(data[key]);
                param.value = newValue;
                param.history.push(newValue);
                if (param.history.length > 10) param.history.shift();
                updateItemStatus(param);
            }
        }
    });

    updateLastUpdate(data.timestamp);
    renderDashboard();
}

function updateItemStatus(item) {
    var previousStatus = item.status;
    item.status = 'normal';
    globalThresholdRules.forEach(function(rule) {
        if (evaluateGlobalRule(rule)) {
            if (item.id === rule.data1 || item.id === rule.data2) {
                if (rule.color === 'green') {
                    item.status = 'success';
                } else if (rule.color === 'yellow') {
                    item.status = 'alert';
                    generateAlert(item, previousStatus, 'alert', rule.message);
                    
                    const alertNotification = {
                        id: Date.now() + Math.random(),
                        timestamp: new Date().toISOString(),
                        type: 'alert',
                        parameter: item.name,
                        value: item.value,
                        unit: item.unit,
                        message: rule.message,
                        status: 'active',
                        severity: 'warning'
                    };
                    addNotification(alertNotification);
                } else if (rule.color === 'red') {
                    item.status = 'critical';
                    generateAlert(item, previousStatus, 'critical', rule.message);
                    
                    const criticalNotification = {
                        id: Date.now() + Math.random(),
                        timestamp: new Date().toISOString(),
                        type: 'critical',
                        parameter: 'System',
                        value: '',
                        unit: '',
                        message: rule.message,
                        status: 'active',
                        severity: 'critical'
                    };
                    addNotification(criticalNotification);
                }
            }
        }
    });
    globalCriticalThresholds.forEach(function(threshold) {
        if (threshold.parameter === item.id && item.value >= threshold.value) {
            item.status = 'critical';
            generateAlert(item, previousStatus, 'critical', `${item.name} reached critical threshold: ${item.value}${item.unit}`);
        }
    });
}

function evaluateGlobalRule(rule) {
    var data1 = getAllMonitoringData().find(item => item.id === rule.data1);
    var data2 = getAllMonitoringData().find(item => item.id === rule.data2);
    
    if (!data1 || !data2) return false;
    
    var condition1 = evaluateCondition(data1.value, rule.operator1, rule.value1);
    var condition2 = evaluateCondition(data2.value, rule.operator2, rule.value2);

    if (rule.logicalOperator === 'AND') {
        return condition1 && condition2;
    } else if (rule.logicalOperator === 'OR') {
        return condition1 || condition2;
    } else if (rule.logicalOperator === 'EQUAL') {
        return condition1 === condition2;
    }
    return false;
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

function openGlobalSettings() {
    const modal = document.getElementById('globalSettingsModal');
    if (!modal) return;
    populateDataSelectors();
    renderThresholdRules();
    renderCriticalSettings();
    
    modal.style.display = 'block';
}

function closeGlobalSettings() {
    const modal = document.getElementById('globalSettingsModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function populateDataSelectors() {
    const selectors = ['newRuleData1', 'newRuleData2', 'newCriticalData'];
    selectors.forEach(selectorId => {
        const selector = document.getElementById(selectorId);
        if (selector) {
            selector.innerHTML = '<option value="">Select Parameter</option>';
            getAllMonitoringData().forEach(item => {
                const option = document.createElement('option');
                option.value = item.id;
                option.textContent = item.name;
                selector.appendChild(option);
            });
        }
    });
}

function addThresholdRule() {
    const data1 = document.getElementById('newRuleData1').value;
    const operator1 = document.getElementById('newRuleOperator1').value;
    const value1 = parseFloat(document.getElementById('newRuleValue1').value);
    const logicalOperatorEl = document.getElementById('newRuleLogicalOperator');
    const logicalOperator = logicalOperatorEl ? logicalOperatorEl.value : 'AND';
    const data2 = document.getElementById('newRuleData2').value;
    const operator2 = document.getElementById('newRuleOperator2').value;
    const value2 = parseFloat(document.getElementById('newRuleValue2').value);
    const message = document.getElementById('newRuleMessage').value;
    const color = document.getElementById('newRuleColor').value;

    if (!data1 || !data2 || isNaN(value1) || isNaN(value2) || !message) {
        showNotification('Please fill all fields for the threshold rule', 'error');
        return;
    }

    const newRule = {
        id: Date.now() + Math.random(),
        data1, operator1, value1,
        data2, operator2, value2,
        logicalOperator,
        message, color
    };
    globalThresholdRules.push(newRule);
    const derivedCritical = {
        id: Date.now() + Math.random(),
        isFromRule: true,
        ruleId: newRule.id
    };
    globalCriticalThresholds.push(derivedCritical);
    renderThresholdRules();
    renderCriticalSettings();

    document.getElementById('newRuleData1').value = '';
    document.getElementById('newRuleValue1').value = '';
    document.getElementById('newRuleData2').value = '';
    document.getElementById('newRuleValue2').value = '';
    document.getElementById('newRuleMessage').value = '';

    saveConfigurationToStorage();
    showNotification('Threshold rule added successfully!', 'success');
}

function addCriticalThreshold() {
    const parameter = document.getElementById('newCriticalData').value;
    const value = parseFloat(document.getElementById('newCriticalValue').value);
    
    if (!parameter || isNaN(value)) {
        showNotification('Please select parameter and enter valid value', 'error');
        return;
    }
    
    const newThreshold = {
        id: Date.now() + Math.random(),
        parameter,
        value
    };
    globalCriticalThresholds.push(newThreshold);
    renderCriticalSettings();
    
    document.getElementById('newCriticalData').value = '';
    document.getElementById('newCriticalValue').value = '';
    
    saveConfigurationToStorage();
    showNotification('Critical threshold added successfully!', 'success');
}

function renderThresholdRules() {
    const container = document.getElementById('thresholdRules');
    if (!container) return;

    if (globalThresholdRules.length === 0) {
        container.innerHTML = '<div class="no-rules">No threshold rules configured</div>';
        return;
    }

    container.innerHTML = globalThresholdRules.map(rule => {
        const data1Name = getAllMonitoringData().find(d => d.id === rule.data1)?.name || rule.data1;
        const data2Name = getAllMonitoringData().find(d => d.id === rule.data2)?.name || rule.data2;
        const logical = rule.logicalOperator || 'AND';

        return `
            <div class="rule-item">
                <div class="rule-condition">
                    <strong>${data1Name}</strong> ${rule.operator1} ${rule.value1}
                    ${logical} <strong>${data2Name}</strong> ${rule.operator2} ${rule.value2}
                </div>
                <div class="rule-message">Message: "${rule.message}"</div>
                <div class="rule-color">Color: <span class="color-badge ${rule.color}">${rule.color}</span></div>
                <button class="btn btn-danger btn-sm" onclick="removeThresholdRule('${rule.id}')">Remove</button>
            </div>
        `;
    }).join('');
}

function renderCriticalSettings() {
    const container = document.getElementById('criticalSettings');
    if (!container) return;
    const items = [];
    const derived = globalCriticalThresholds.filter(th => th.isFromRule);
    derived.forEach(threshold => {
        const rule = globalThresholdRules.find(r => r.id === threshold.ruleId);
        if (!rule) return;
        const data1Name = getAllMonitoringData().find(d => d.id === rule.data1)?.name || rule.data1;
        const data2Name = getAllMonitoringData().find(d => d.id === rule.data2)?.name || rule.data2;
        const logical = rule.logicalOperator || 'AND';
        const conditionText = `${data1Name} ${rule.operator1} ${rule.value1} ${logical} ${data2Name} ${rule.operator2} ${rule.value2}`;
        const isTriggered = evaluateGlobalRule(rule);
        const critVal = threshold.value !== undefined ? threshold.value : "";

        items.push(`
            <div class="critical-item ${isTriggered ? 'triggered' : ''}">
                <div class="critical-condition">
                    <strong>${rule.message}</strong>
                    <div class="threshold-condition">Rule: ${conditionText}</div>
                    <div class="threshold-status">Status: ${isTriggered ? 'TRIGGERED' : 'Normal'}</div>
                    <div class="threshold-input">
                        <label>Critical Value:</label>
                        <input type="number" step="0.1" value="${critVal}" 
                            onchange="updateCriticalValue('${threshold.id}', this.value)">
                    </div>
                </div>
                <button class="btn btn-danger btn-sm" onclick="removeCriticalThreshold('${threshold.id}')">Remove</button>
            </div>
        `);
    });

    const manual = globalCriticalThresholds.filter(th => !th.isFromRule);
    manual.forEach(threshold => {
        const paramName = getAllMonitoringData().find(d => d.id === threshold.parameter)?.name || threshold.parameter;
        const critVal = threshold.value !== undefined ? threshold.value : "";

        items.push(`
            <div class="critical-item">
                <div class="critical-condition">
                    <strong>${paramName}</strong>
                    <div class="threshold-input">
                        <label>Critical Value:</label>
                        <input type="number" step="0.1" value="${critVal}" 
                            onchange="updateCriticalValue('${threshold.id}', this.value)">
                    </div>
                </div>
                <button class="btn btn-danger btn-sm" onclick="removeCriticalThreshold('${threshold.id}')">Remove</button>
            </div>
        `);
    });

    container.innerHTML = items.length === 0 ? '<div class="no-settings">No critical thresholds configured</div>' : items.join('');
}

function updateCriticalValue(thresholdId, newValue) {
    const idToUpdate = (typeof thresholdId === 'string') ? parseFloat(thresholdId) : thresholdId;
    const threshold = globalCriticalThresholds.find(th => th.id === idToUpdate);
    if (!threshold) return;

    threshold.value = parseFloat(newValue);

    saveConfigurationToStorage();
    showNotification('Critical threshold value updated', 'success');
}   

function removeThresholdRule(ruleId) {
    const idToRemove = (typeof ruleId === 'string') ? parseFloat(ruleId) : ruleId;
    if (isNaN(idToRemove)) {
        showNotification('Invalid rule id', 'error');
        return;
    }
    globalThresholdRules = globalThresholdRules.filter(rule => rule.id !== idToRemove);
    globalCriticalThresholds = globalCriticalThresholds.filter(th => !(th.isFromRule && th.ruleId === idToRemove));

    renderThresholdRules();
    renderCriticalSettings();
    saveConfigurationToStorage();
    showNotification('Threshold rule removed', 'info');
}

function removeCriticalThreshold(thresholdId) {
    const idToRemove = (typeof thresholdId === 'string') ? parseFloat(thresholdId) : thresholdId;
    if (isNaN(idToRemove)) {
        showNotification('Invalid threshold id', 'error');
        return;
    }

    const threshold = globalCriticalThresholds.find(th => th.id === idToRemove);
    if (!threshold) return;

    if (threshold.isFromRule && threshold.ruleId) {
        globalThresholdRules = globalThresholdRules.filter(r => r.id !== threshold.ruleId);
    }

    globalCriticalThresholds = globalCriticalThresholds.filter(th => th.id !== idToRemove);

    renderThresholdRules();
    renderCriticalSettings();
    saveConfigurationToStorage();
    showNotification('Critical threshold removed', 'info');
}

function addNotification(notification) {
    const now = Date.now();

    const isDuplicate = allNotifications.some(n =>
        n.message === notification.message &&
        Math.abs(new Date(n.timestamp).getTime() - now) < 2000
    );
    if (isDuplicate) return;

    if (notification.type === 'alert') {
        const ruleKey = notification.message; 
        if (!ruleAlertCounters[ruleKey]) {
            ruleAlertCounters[ruleKey] = 0;
        }
        ruleAlertCounters[ruleKey]++;

        const derivedThreshold = globalCriticalThresholds.find(th => 
            (th.isFromRule && th.ruleId) || 
            (!th.isFromRule && th.parameter === notification.parameter)
        );

        let critVal = derivedThreshold && derivedThreshold.value ? derivedThreshold.value : 0;

        if (critVal > 0 && ruleAlertCounters[ruleKey] >= critVal) {
            notification.type = 'critical';
            notification.severity = 'critical';
            notification.status = 'active';

            if (mqttClient && mqttClient.connected) {
                mqttClient.publish(TOPIC_CRITICAL, JSON.stringify(notification), { qos: 1 });
                console.log("Critical alert published via MQTT (from counter):", notification);
            } else {
                console.error("MQTT not connected, failed to publish critical alert:", notification);
            }
            ruleAlertCounters[ruleKey] = 0;
        }
    }

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
        if (mqttClient && mqttClient.connected) {
            mqttClient.publish(TOPIC_CRITICAL, JSON.stringify(alertMessage), { qos: 1 });
            console.log("Critical alert published via MQTT:", alertMessage);
            lastCriticalSent[item.id] = now;
        } else {
            console.error("MQTT not connected, failed to send alert:", alertMessage);
        }
    }

    outputMessages.unshift(alertMessage);
    if (outputMessages.length > 50) {
        outputMessages = outputMessages.slice(0, 50);
    }
    updateOutputDisplay();

    if (newStatus === 'critical') {
        var outputSection = document.getElementById('outputSection');
        if (outputSection) {
            outputSection.style.display = 'block';
        }
    }
    console.log('CBM_ALERT:', JSON.stringify(alertMessage));
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

    if (Object.keys(monitoringDataByMotor).length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #fff; padding: 40px;">No data available. Waiting for real-time data...</div>';
        return;
    }

    Object.keys(monitoringDataByMotor).forEach(motorName => {
        const header = document.createElement("h2");
        header.textContent = motorName;
        header.style.color = "#fff";
        header.style.gridColumn = "1/-1";
        grid.appendChild(header);

        monitoringDataByMotor[motorName].forEach(item => {
            var card = createMonitoringCard(item);
            grid.appendChild(card);
        });
    });
}

function refreshMotorDropdown() {
    const selector = document.getElementById("motorSelector");
    if (!selector) return;

    selector.innerHTML = '';
    Object.keys(monitoringDataByMotor).forEach(motorName => {
        const option = document.createElement("option");
        option.value = motorName;
        option.textContent = motorName;
        selector.appendChild(option);
    });
}

function createMonitoringCard(item) {
    var card = document.createElement('div');
    card.className = 'monitoring-card status-' + item.status;
    card.onclick = function() { openGlobalSettings(); };

    var chartBars = item.history.map(function(val) {
        var height = Math.max(5, ((val - item.min) / (item.max - item.min)) * 100);
        if (isNaN(height)) height = 5;
        return '<div class="chart-bar" style="height: ' + height + '%"></div>';
    }).join('');

    card.innerHTML =
        '<div class="card-header">' +
            '<div class="card-title">' + item.name + '</div>' +
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
        outputContent.innerHTML = '<div style="color: #5f7f96; text-align: center; padding: 20px;">No alerts</div>';
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
                </div>
                <div class="notification-actions">
                    ${notification.status === 'active' ? 
                        '<button class="notification-btn resolve" onclick="resolveNotification(\'' + notification.id + '\')">Mark Resolved</button>' : 
                        '<span style="color: #10b981; font-size: 12px;">Ã¢Å“â€¦ Resolved</span>'
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
        case 'alert': return '⚠️';
        case 'resolved': return '✅';
        default: return 'ℹ️';
    }
}

function updateNotificationStats() {
    let totalCritical = 0;
    let totalAlerts = 0;
    let totalResolved = 0;

    allNotifications.forEach(n => {
        if (n.type === 'critical') totalCritical++;
        else if (n.type === 'alert') totalAlerts++;
        else if (n.type === 'resolved') totalResolved++;
    });

    const critEl = document.getElementById('totalCritical');
    const alertEl = document.getElementById('totalAlerts');
    const resolvedEl = document.getElementById('totalResolved');
    const normalCountEl = document.getElementById('normalCount');
    const criticalCountEl = document.getElementById('criticalCount');

    if (critEl) critEl.textContent = totalCritical;
    if (alertEl) alertEl.textContent = totalAlerts;
    if (resolvedEl) resolvedEl.textContent = totalResolved;

    const systemStatus = getSystemStatus();
    if (normalCountEl) normalCountEl.textContent = `${systemStatus.normal} Normal`;
    if (criticalCountEl) criticalCountEl.textContent = `${systemStatus.critical} Critical`;
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
        saveConfigurationToStorage();
        renderNotifications();
        updateNotificationStats();
        showNotification('All notifications cleared!', 'info');
    }
}

function openNotificationSettings() {
    const modal = document.getElementById('notificationSettingsModal');
    if (!modal) return;
    
    renderCriticalThresholdsList();
    modal.style.display = 'block';
}

function closeNotificationSettings() {
    const modal = document.getElementById('notificationSettingsModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function renderCriticalThresholdsList() {
    const container = document.getElementById('criticalThresholdsList');
    if (!container) return;
    
    if (globalCriticalThresholds.length === 0) {
        container.innerHTML = '<div class="no-thresholds">No critical thresholds configured. Go to Condition Monitoring to set up threshold rules with red color.</div>';
        return;
    }
    
    container.innerHTML = globalCriticalThresholds.map(threshold => {
        if (threshold.isFromRule) {
            const rule = globalThresholdRules.find(r => r.id === threshold.ruleId);
            if (!rule) return '';
            
            const data1Item = getAllMonitoringData().find(d => d.id === rule.data1);
            const data1Name = data1Item ? data1Item.name : rule.data1;
            let conditionText = `${data1Name} ${rule.operator1} ${rule.value1}`;
            
            if (rule.logicalOperator === 'AND' || rule.logicalOperator === 'OR') {
                const data2Item = getAllMonitoringData().find(d => d.id === rule.data2);
                const data2Name = data2Item ? data2Item.name : rule.data2;
                conditionText += ` ${rule.logicalOperator} ${data2Name} ${rule.operator2} ${rule.value2}`;
            }
            
            const isTriggered = evaluateGlobalRule(rule);
            
            return `
                <div class="threshold-item ${isTriggered ? 'triggered' : ''}">
                    <div class="threshold-info">
                        <div class="threshold-parameter">${rule.message}</div>
                        <div class="threshold-condition">Rule: ${conditionText}</div>
                        <div class="threshold-status">Status: ${isTriggered ? 'TRIGGERED' : 'Normal'}</div>
                    </div>
                    <div class="threshold-status-indicator ${isTriggered ? 'critical' : 'normal'}"></div>
                </div>
            `;
        }
        return '';
    }).join('');
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
                monitoringDataByMotor: monitoringDataByMotor,
                globalThresholdRules: globalThresholdRules,
                globalCriticalThresholds: globalCriticalThresholds,
                allNotifications: allNotifications,
                ruleAlertCounters: ruleAlertCounters
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
                    if (importData.cbm.globalThresholdRules) globalThresholdRules = importData.cbm.globalThresholdRules;
                    if (importData.cbm.globalCriticalThresholds) globalCriticalThresholds = importData.cbm.globalCriticalThresholds;
                    if (importData.cbm.allNotifications) allNotifications = importData.cbm.allNotifications;
                    if (importData.cbm.ruleAlertCounters) ruleAlertCounters = importData.cbm.ruleAlertCounters;

                    if (importData.cbm.monitoringDataByMotor) {
                        monitoringDataByMotor = importData.cbm.monitoringDataByMotor;
                    } else {
                        monitoringDataByMotor = {};
                        initializeDefaultMonitoringData("Motor_1");
                    }
                }

                saveConfigurationToStorage();
                saveArchitectureData();
                renderDashboard();
                refreshMotorDropdown();
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
    }
    setInterval(fetchData, 2000);
}

function showNotification(message, type) {
    var notification = document.createElement('div');
    var bgColor = {
        success: '#4caf50',
        error: '#f44336',
        info: '#2196f3'
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
    let critical = 0;
    let alerts = 0;
    let normal = 0;

    getAllMonitoringData().forEach(item => {
        if (item.status === 'critical') critical++;
        else if (item.status === 'alert') alerts++;
        else normal++;
    });

    return { critical, alerts, normal };
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
    var globalModal = document.getElementById('globalSettingsModal');
    var notificationModal = document.getElementById('notificationSettingsModal');
    
    if (globalModal && event.target === globalModal) {
        closeGlobalSettings();
    }
    if (notificationModal && event.target === notificationModal) {
        closeNotificationSettings();
    }
};

document.addEventListener('DOMContentLoaded', function() {
    console.log('Industrial Dashboard Suite loaded successfully');
    console.log('Loading saved configurations...');
    
    if (loadArchitectureData()) {
        components.forEach(renderComponent);
        updateConnections();
    }
    loadConfigurationFromStorage();
    
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
        saveConfigurationToStorage();
        saveArchitectureData();
        console.log('Auto-saved all configurations.');
    }, 300000);
    
    setTimeout(function() {
        showNotification('Welcome To Bosch Company.', 'info');
    }, 2000);
});