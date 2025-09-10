const mqttHistory = mqtt.connect("wss://broker.hivemq.com:8884/mqtt");
const TOPIC_HISTORY = "cbm/history";
let historyColumns = [];
const excludedFields = ["result", "table", "_time"];

mqttHistory.on("connect", () => {
    console.log("Connected to MQTT for History");
    mqttHistory.subscribe(TOPIC_HISTORY);
});

mqttHistory.on("message", (topic, message) => {
    if (topic === TOPIC_HISTORY) {
        try {
            const payload = JSON.parse(message.toString());
            if (Array.isArray(payload)) {
                payload.forEach(d => addHistoryRow(d));
            } else {
                addHistoryRow(payload);
            }
        } catch (err) {
            console.error("Invalid history message", err);
        }
    }
});

function formatTimestamp(ts) {
    if (!ts) return "-";
    try {
        const d = new Date(ts);
        if (isNaN(d.getTime())) return ts;

        // format misalnya: "10 Sep 2025, 11:01:35"
        const dateStr = new Intl.DateTimeFormat('id-ID', { 
            day: '2-digit', month: 'short', year: 'numeric' 
        }).format(d);
        const timeStr = new Intl.DateTimeFormat('id-ID', { 
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false 
        }).format(d).replace(/\./g, ':');
        return `${dateStr}, ${timeStr}`;
    } catch (e) {
        return ts;
    }
}

function addHistoryRow(data) {
    const table = document.getElementById("historyTable");
    const thead = table.querySelector("thead");
    const tbody = table.querySelector("tbody");
    const rowData = {
        time: data._time ? formatTimestamp(data._time) : "-",
        value: data._value ?? "-",
        field: data._field || "-",
        measurement: data._measurement || "-"
    };
    if (historyColumns.length === 0) {
        historyColumns = ["time", "value", "field", "measurement"];

        thead.innerHTML = `
            <tr>
                ${historyColumns.map((key, idx) => 
                    `<th onclick="sortHistoryTable(${idx})" style="cursor:pointer;">${key}</th>`
                ).join("")}
            </tr>
        `;

        const sortSelect = document.getElementById("historySort");
        if (sortSelect) {
            sortSelect.innerHTML = `
                <option value="">Select Sort Option</option>
                <option value="date_asc">Date (Oldest First)</option>
                <option value="date_desc">Date (Newest First)</option>
                <option value="value_desc">Value (High → Low)</option>
                <option value="value_asc">Value (Low → High)</option>
            `;
        }
    }

    // tambah row baru
    const row = tbody.insertRow();
    historyColumns.forEach(key => {
        const cell = row.insertCell();
        let displayValue = rowData[key];
        let rawValue = rowData[key];

        if (key === "time" && data._time) {
            displayValue = formatTimestamp(data._time);
            rawValue = new Date(data._time).getTime();
        }
        if (key === "value" && data._value !== undefined) {
            displayValue = data._value;
            rawValue = parseFloat(data._value);
        }

        cell.textContent = displayValue;
        cell.setAttribute("data-value", rawValue);
    });
}

function filterHistoryTable() {
    const input = document.getElementById("historySearch");
    if (!input) {
        console.error("Element historySearch tidak ditemukan");
        return;
    }
    
    const searchValue = input.value.toLowerCase();
    const table = document.getElementById("historyTable");
    const tbody = table.querySelector("tbody");
    const rows = tbody.querySelectorAll("tr");
    
    rows.forEach(row => {
        const cells = row.querySelectorAll("td");
        let found = false;
        cells.forEach(cell => {
            if (cell.textContent.toLowerCase().includes(searchValue)) {
                found = true;
            }
        });
        
        row.style.display = found ? "" : "none";
    });
}

function sortHistoryTable(colIndex) {
    const table = document.getElementById("historyTable");
    const tbody = table.querySelector("tbody");
    let rows = Array.from(tbody.querySelectorAll("tr"));
    
    let currentSort = table.getAttribute("data-sort-dir") || "desc";
    let newSort = currentSort === "asc" ? "desc" : "asc";
    
    rows.sort((rowA, rowB) => {
        const cellA = rowA.cells[colIndex];
        const cellB = rowB.cells[colIndex];
        
        if (!cellA || !cellB) return 0;
        
        let valueA = cellA.getAttribute("data-value") || cellA.textContent.trim();
        let valueB = cellB.getAttribute("data-value") || cellB.textContent.trim();
        
        if (valueA === "-" || valueA === "") valueA = newSort === "asc" ? "zzz" : "";
        if (valueB === "-" || valueB === "") valueB = newSort === "asc" ? "zzz" : "";
        
        const numA = parseFloat(valueA);
        const numB = parseFloat(valueB);
        
        if (!isNaN(numA) && !isNaN(numB)) {
            return newSort === "asc" ? numA - numB : numB - numA;
        } else {
            return newSort === "asc" ? 
                valueA.localeCompare(valueB, undefined, { numeric: true, sensitivity: 'base' }) :
                valueB.localeCompare(valueA, undefined, { numeric: true, sensitivity: 'base' });
        }
    });
    tbody.innerHTML = "";
    rows.forEach(row => tbody.appendChild(row));
    table.setAttribute("data-sort-dir", newSort);
    
    const headers = table.querySelectorAll("th");
    headers.forEach((header, index) => {
        header.classList.remove("sort-asc", "sort-desc");
        if (index === colIndex) {
            header.classList.add(`sort-${newSort}`);
        }
    });
}

function sortHistoryByOption() {
    const sortSelect = document.getElementById("historySort");
    if (!sortSelect) {
        console.error("Element historySort tidak ditemukan");
        return;
    }
    
    const sortOption = sortSelect.value;
    if (!sortOption) return;
    
    const table = document.getElementById("historyTable");
    const tbody = table.querySelector("tbody");
    let rows = Array.from(tbody.querySelectorAll("tr"));
    
    if (rows.length === 0) return;
    
    let sortColumnIndex = -1;
    let isAscending = true;
    
    if (sortOption.includes("date")) {
        sortColumnIndex = historyColumns.findIndex(col => 
            col.toLowerCase().includes("date") || 
            col.toLowerCase().includes("time") || 
            col.toLowerCase().includes("timestamp")
        );
        isAscending = sortOption.includes("asc");
    } else if (sortOption.includes("value")) {
        sortColumnIndex = historyColumns.findIndex(col => col.toLowerCase() === "value");
        if (sortColumnIndex === -1) sortColumnIndex = findBestNumericColumn(); // fallback
        isAscending = sortOption.includes("asc");
    }
    
    if (sortColumnIndex === -1) {
        sortColumnIndex = 0;
    }
    
    rows.sort((rowA, rowB) => {
        const cellA = rowA.cells[sortColumnIndex];
        const cellB = rowB.cells[sortColumnIndex];
        
        if (!cellA || !cellB) return 0;
        
        let valueA = cellA.textContent.trim();
        let valueB = cellB.textContent.trim();
        
        if (valueA === "-" || valueA === "") {
            return isAscending ? 1 : -1;
        }
        if (valueB === "-" || valueB === "") {
            return isAscending ? -1 : 1;
        }
        
        if (sortOption.includes("date")) {
            const dateA = new Date(valueA.includes("T") ? valueA : Date.parse(valueA));
            const dateB = new Date(valueB.includes("T") ? valueB : Date.parse(valueB));
            
            if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
                return isAscending ? dateA - dateB : dateB - dateA;
            }
        }
        
        if (sortOption.includes("value")) {
            const numA = parseFloat(valueA);
            const numB = parseFloat(valueB);
            
            if (!isNaN(numA) && !isNaN(numB)) {
                return isAscending ? numA - numB : numB - numA;
            }
            else if (!isNaN(numA) && isNaN(numB)) {
                return isAscending ? -1 : 1;
            }
            else if (isNaN(numA) && !isNaN(numB)) {
                return isAscending ? 1 : -1;
            }
        }
        
        return isAscending ? 
            valueA.localeCompare(valueB, undefined, { numeric: true, sensitivity: 'base' }) :
            valueB.localeCompare(valueA, undefined, { numeric: true, sensitivity: 'base' });
    });
    
    tbody.innerHTML = "";
    rows.forEach(row => tbody.appendChild(row));
    
    const headers = table.querySelectorAll("th");
    headers.forEach((header, index) => {
        header.classList.remove("sort-asc", "sort-desc");
        if (index === sortColumnIndex) {
            header.classList.add(isAscending ? "sort-asc" : "sort-desc");
        }
    });
    
    table.setAttribute("data-sort-dir", isAscending ? "asc" : "desc");
}

function findBestNumericColumn() {
    const table = document.getElementById("historyTable");
    const tbody = table.querySelector("tbody");
    const rows = tbody.querySelectorAll("tr");
    
    if (rows.length === 0) return 0;
    
    let bestColumnIndex = 0;
    let bestNumericScore = 0;
    
    for (let colIndex = 0; colIndex < historyColumns.length; colIndex++) {
        let numericCount = 0;
        let totalCount = 0;
        
        const sampleSize = Math.min(rows.length, 10);
        
        for (let rowIndex = 0; rowIndex < sampleSize; rowIndex++) {
            const cell = rows[rowIndex].cells[colIndex];
            if (cell) {
                const value = cell.textContent.trim();
                if (value && value !== "-") {
                    totalCount++;
                    const numericValue = parseFloat(value);
                    if (!isNaN(numericValue)) {
                        numericCount++;
                    }
                }
            }
        }
        const numericScore = totalCount > 0 ? numericCount / totalCount : 0;
        
        if (numericScore > bestNumericScore) {
            bestNumericScore = numericScore;
            bestColumnIndex = colIndex;
        }
    }
    
    return bestColumnIndex;
}

function showHistory() {
    document.getElementById('architectureSection').classList.remove('active');
    document.getElementById('monitoringSection').classList.remove('active');
    document.getElementById('notificationsSection').classList.remove('active');
    document.getElementById('historySection').classList.add('active');
    
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const historyBtn = document.querySelector('.nav-btn[onclick*="showHistory"]') || 
                      document.querySelector('button[onclick="showHistory()"]');
    if (historyBtn) {
        historyBtn.classList.add('active');
    }
}

function clearHistoryTable() {
    const tbody = document.querySelector("#historyTable tbody");
    if (tbody) {
        tbody.innerHTML = "";
    }

    historyColumns = [];
    const thead = document.querySelector("#historyTable thead");
    if (thead) {
        thead.innerHTML = "";
    }
    
    const sortSelect = document.getElementById("historySort");
    if (sortSelect) {
        sortSelect.value = "";
    }
}

function debugHistoryTable() {
    console.log("History Columns:", historyColumns);
    console.log("Table exists:", !!document.getElementById("historyTable"));
    console.log("Search input exists:", !!document.getElementById("historySearch"));
    console.log("Sort select exists:", !!document.getElementById("historySort"));
}

function exportHistoryToCSV() {
    const table = document.getElementById("historyTable");
    const rows = table.querySelectorAll("tr");
    
    if (rows.length === 0 || historyColumns.length === 0) {
        alert("No data to export. Please wait for data to be received or check the connection.");
        return;
    }
    
    let csvContent = "";
    
    if (historyColumns.length > 0) {
        csvContent += historyColumns.map(col => `"${col}"`).join(",") + "\n";
    }
    
    const dataRows = table.querySelectorAll("tbody tr");
    dataRows.forEach(row => {
        const cells = Array.from(row.cells);
        const rowData = cells.map(cell => {
            let value = cell.textContent.trim();
            if (value.includes(",") || value.includes('"') || value.includes("\n")) {
                value = `"${value.replace(/"/g, '""')}"`;
            } else {
                value = `"${value}"`;
            }
            return value;
        });
        csvContent += rowData.join(",") + "\n";
    });
    
    if (csvContent === historyColumns.map(col => `"${col}"`).join(",") + "\n") {
        alert("No data rows to export.");
        return;
    }
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, -5);
        link.setAttribute("download", `history_data_${timestamp}.csv`);
        
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        console.log("Historical data exported successfully");
        alert(`CSV exported successfully! File: history_data_${timestamp}.csv`);
    } else {
        alert("Your browser doesn't support file download.");
    }
}

function importHistoryFromCSV(file) {
    if (!file) {
        console.error("No file selected");
        return;
    }
    
    if (!file.name.toLowerCase().endsWith('.csv')) {
        alert("Please select a CSV file.");
        return;
    }
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const csvData = e.target.result;
            parseAndImportCSV(csvData);
        } catch (error) {
            console.error("Error reading file:", error);
            alert("Error reading the CSV file. Please check the file format.");
        }
    };
    
    reader.onerror = function() {
        console.error("Error reading file");
        alert("Error reading the file. Please try again.");
    };
    
    reader.readAsText(file);
}

function parseAndImportCSV(csvData) {
    try {
        const lines = csvData.split('\n').filter(line => line.trim() !== '');
        
        if (lines.length === 0) {
            alert("The CSV file appears to be empty.");
            return;
        }
        
        const headerLine = lines[0];
        const headers = parseCSVLine(headerLine);
        
        if (headers.length === 0) {
            alert("Invalid CSV format: No headers found.");
            return;
        }
        
        const confirmImport = confirm(
            `Import ${lines.length - 1} rows with ${headers.length} columns?\n\n` +
            `Headers: ${headers.join(', ')}\n\n` +
            `This will replace the current data in the table.`
        );
        
        if (!confirmImport) {
            return;
        }
        
        clearHistoryTable();
        historyColumns = headers.filter(header => !excludedFields.includes(header));
        
        const table = document.getElementById("historyTable");
        const thead = table.querySelector("thead");
        thead.innerHTML = `
            <tr>
                ${historyColumns.map((key, idx) => `<th onclick="sortHistoryTable(${idx})" style="cursor:pointer;">${key}</th>`).join("")}
            </tr>
        `;
        
        const sortSelect = document.getElementById("historySort");
        if (sortSelect) {
            sortSelect.innerHTML = `
                <option value="">Select Sort Option</option>
                <option value="date_asc">Date (Oldest First)</option>
                <option value="date_desc">Date (Newest First)</option>
                <option value="value_desc">Value (High â†’ Low)</option>
                <option value="value_asc">Value (Low â†’ High)</option>
            `;
        }
        let importedCount = 0;
        const tbody = table.querySelector("tbody");
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line === '') continue;
            
            try {
                const values = parseCSVLine(line);
                
                if (values.length !== headers.length) {
                    console.warn(`Row ${i + 1}: Column count mismatch. Expected ${headers.length}, got ${values.length}`);
                    continue;
                }
                
                const dataObject = {};
                headers.forEach((header, index) => {
                    dataObject[header] = values[index] || '';
                });
                
                const row = tbody.insertRow();
                historyColumns.forEach(key => {
                    const cell = row.insertCell();
                    const value = dataObject[key] || '-';
                    cell.textContent = value;
                    cell.setAttribute("data-value", value);
                });
                
                importedCount++;
            } catch (error) {
                console.warn(`Error parsing row ${i + 1}:`, error);
            }
        }
        
        console.log(`Successfully imported ${importedCount} rows`);
        alert(`Successfully imported ${importedCount} rows from CSV file.`);
        
    } catch (error) {
        console.error("Error parsing CSV:", error);
        alert("Error parsing the CSV file. Please check the file format and try again.");
    }
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    
    while (i < line.length) {
        const char = line[i];
        
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i += 2;
            } else {
                inQuotes = !inQuotes;
                i++;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
            i++;
        } else {
            current += char;
            i++;
        }
    }
    result.push(current.trim());
    
    return result;
}

document.addEventListener('DOMContentLoaded', function() {
    const requiredElements = ['historyTable', 'historySearch', 'historySort', 'importHistoryFile'];
    requiredElements.forEach(id => {
        const element = document.getElementById(id);
        if (!element) {
            console.warn(`Element dengan ID '${id}' tidak ditemukan`);
        }
    });
});

document.addEventListener('DOMContentLoaded', function() {
    const requiredElements = ['historyTable', 'historySearch', 'historySort'];
    requiredElements.forEach(id => {
        const element = document.getElementById(id);
        if (!element) {
            console.warn(`Element dengan ID '${id}' tidak ditemukan`);
        }
    });
});