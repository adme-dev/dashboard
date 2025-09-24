function arrayToCSV(data, options = {}) {
  const {
    delimiter = ",",
    includeHeaders = true,
    dateFormat = "YYYY-MM-DD"
  } = options;
  if (!data.length) return "";
  const headers = Object.keys(data[0]);
  const formatValue = (value) => {
    if (value === null || value === void 0) return "";
    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }
    if (typeof value === "number") {
      return value.toString();
    }
    const stringValue = String(value);
    if (stringValue.includes(delimiter) || stringValue.includes('"') || stringValue.includes("\n")) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };
  const csvContent = [];
  if (includeHeaders) {
    csvContent.push(headers.map((header) => formatValue(header)).join(delimiter));
  }
  data.forEach((row) => {
    const values = headers.map((header) => formatValue(row[header]));
    csvContent.push(values.join(delimiter));
  });
  return csvContent.join("\n");
}
function downloadCSV(data, filename, options = {}) {
  const csv = arrayToCSV(data, options);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = (void 0).createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename.endsWith(".csv") ? filename : `${filename}.csv`);
  link.style.visibility = "hidden";
  (void 0).body.appendChild(link);
  link.click();
  (void 0).body.removeChild(link);
  URL.revokeObjectURL(url);
}
function downloadJSON(data, filename) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
  const link = (void 0).createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename.endsWith(".json") ? filename : `${filename}.json`);
  link.style.visibility = "hidden";
  (void 0).body.appendChild(link);
  link.click();
  (void 0).body.removeChild(link);
  URL.revokeObjectURL(url);
}
function getExportFilename(type, format = "csv") {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  return `${type}-export-${timestamp}.${format}`;
}

export { arrayToCSV, downloadCSV, downloadJSON, getExportFilename };
//# sourceMappingURL=export-DLEQSllu.mjs.map
