import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AppWindow, Box, Cable, ChevronDown, ChevronRight, CircleHelp, Cloud, Cpu,
  Database, Download, Ellipsis, EthernetPort, FilePlus2, Gauge, Grid3X3,
  FolderOpen, Globe2, HardDrive, Headphones, HousePlug, Laptop, LockKeyhole, Mail, Menu, Minus, Monitor,
  Moon, MousePointer2, Network, PanelLeftClose, PanelLeftOpen, Phone, Plus, Printer,
  Pencil, RadioTower, Redo2, RotateCcw, Router, Save, Search, Server, ShieldCheck,
  Smartphone, Sparkles, SquareDashedMousePointer, Sun, Trash2, TriangleAlert, Undo2, Upload,
  Video, Wifi, X, ZoomIn, ZoomOut
} from 'lucide-react';
import './styles.css';
import { getDeviceDefinition } from './simulation/definitions.js';
import { createSwitchCliSession, executeSwitchCommand, switchPrompt } from './simulation/managedSwitchCli.js';
import { createNgfwCliSession, executeNgfwCommand, ngfwPrompt } from './simulation/ngfwCli.js';
import { createRouterCliSession, executeRouterCommand, routerPrompt } from './simulation/routerCli.js';
import { findDuplicateIpConflicts, validateConnections } from './simulation/connectionValidation.js';

const categories = [
  { id: 'routers', label: 'Routers', icon: Router },
  { id: 'switches', label: 'Switches', icon: EthernetPort },
  { id: 'hubs', label: 'Hubs', icon: Network },
  { id: 'wireless', label: 'Wireless', icon: Wifi },
  { id: 'security', label: 'Security', icon: ShieldCheck },
  { id: 'wan', label: 'Internet & WAN', icon: Cloud },
  { id: 'end', label: 'End Devices', icon: Monitor },
  { id: 'industrial', label: 'Industrial', icon: Gauge },
  { id: 'smart', label: 'Smart Home', icon: HousePlug },
  { id: 'components', label: 'Components', icon: Cpu }
];

// Capabilities are reusable feature identifiers. A future packet engine can
// implement each feature once and expose it only to devices that declare it.
const capabilities = {
  ip: 'IP addressing',
  routing: 'Routing',
  switching: 'Ethernet switching',
  wifi: 'Wi-Fi',
  dhcp: 'DHCP',
  nat: 'NAT',
  acl: 'ACLs',
  statelessFirewall: 'Stateless filtering',
  statefulFirewall: 'Stateful filtering',
  appAwareness: 'Application awareness',
  ips: 'Intrusion prevention',
  deepInspection: 'Deep inspection',
  externalNetwork: 'External network',
  internetAccess: 'Internet access',
  providerNetwork: 'Service provider network',
  ispProvisioning: 'Automatic ISP provisioning',
  mediaConversion: 'Media conversion',
  dnsService: 'DNS service',
  dhcpService: 'DHCP service',
  webService: 'Web service',
  emailService: 'Email service',
  fileService: 'File service',
  vlans: 'VLANs',
  cli: 'Command-line configuration'
};

const serverRoles = [
  { id: 'generic', name: 'Generic Server', icon: Server, purpose: 'A configurable host for custom network services.', capabilities: ['ip'] },
  { id: 'dns', name: 'DNS Server', icon: Network, purpose: 'Resolves names by serving DNS zones and records.', capabilities: ['ip', 'dnsService'] },
  { id: 'dhcp', name: 'DHCP Server', icon: Database, purpose: 'Assigns IP configuration to clients on connected networks.', capabilities: ['ip', 'dhcpService'] },
  { id: 'web', name: 'Web Server', icon: Globe2, purpose: 'Hosts websites over HTTP and HTTPS.', capabilities: ['ip', 'webService'] },
  { id: 'email', name: 'Email Server', icon: Mail, purpose: 'Sends and receives email for a configured domain.', capabilities: ['ip', 'emailService'] },
  { id: 'file', name: 'File Server', icon: FolderOpen, purpose: 'Provides shared files to network clients.', capabilities: ['ip', 'fileService'] }
];

const devices = [
  { id: 'router-basic', name: 'Basic Router', category: 'routers', icon: Router, color: '#5f79ff', ports: '2 network interfaces', purpose: 'Connects and routes traffic between two networks.', capabilities: ['ip', 'routing'] },
  { id: 'router-home', name: 'Home Router', category: 'routers', icon: Wifi, color: '#5f79ff', ports: '4 LAN · 1 WAN · Wi-Fi', purpose: 'An all-in-one gateway for a small home network.', capabilities: ['ip', 'routing', 'switching', 'wifi', 'dhcp', 'nat', 'statefulFirewall'] },
  { id: 'router-advanced', name: 'Advanced Router', category: 'routers', icon: Router, color: '#5f79ff', ports: '4 routed interfaces', purpose: 'Routes larger networks and supports 802.1Q subinterfaces.', capabilities: ['ip', 'routing', 'dhcp', 'nat', 'acl', 'statelessFirewall', 'cli', 'vlanTrunk'] },
  { id: 'switch-basic', name: 'Basic Switch', category: 'switches', icon: EthernetPort, color: '#16a3a6', ports: '8 Ethernet ports', purpose: 'Connects wired devices on one local network.', capabilities: ['switching'] },
  { id: 'switch-managed', name: 'Managed Switch', category: 'switches', icon: EthernetPort, color: '#16a3a6', ports: '8 Ethernet ports', purpose: 'A command-line configurable switch with VLAN support.', capabilities: ['switching', 'vlans', 'cli'] },
  { id: 'hub', name: 'Repeater Hub', category: 'hubs', icon: Network, color: '#d68a28', model: 'Hub-PT' },
  { id: 'repeater', name: 'Repeater', category: 'hubs', icon: RadioTower, color: '#d68a28', model: 'Repeater-PT' },
  { id: 'ap', name: 'Access Point', category: 'wireless', icon: Wifi, color: '#7c62c8', model: 'AccessPoint-PT' },
  { id: 'wireless-router', name: 'Wireless Gateway', category: 'wireless', icon: RadioTower, color: '#7c62c8', ports: '4 LAN · 1 WAN · Wi-Fi', purpose: 'Connects wireless devices to a small wired network.', capabilities: ['switching', 'wifi', 'dhcp', 'nat'] },
  { id: 'cell-tower', name: 'Cell Tower', category: 'wireless', icon: RadioTower, color: '#7c62c8', model: 'Cell Tower' },
  { id: 'firewall-stateless', name: 'Stateless Firewall', category: 'security', icon: ShieldCheck, color: '#df5a60', ports: '2 routed interfaces', purpose: 'Checks each packet against ordered IP, port, and protocol rules.', capabilities: ['ip', 'routing', 'statelessFirewall', 'acl'] },
  { id: 'firewall-stateful', name: 'Stateful Firewall', category: 'security', icon: ShieldCheck, color: '#df5a60', ports: '2 routed interfaces', purpose: 'Tracks connections so legitimate return traffic can pass.', capabilities: ['ip', 'routing', 'statelessFirewall', 'statefulFirewall', 'acl'] },
  { id: 'firewall-ngfw', name: 'Next-Generation Firewall', category: 'security', icon: ShieldCheck, color: '#df5a60', ports: '4 routed interfaces', purpose: 'Identifies applications and inspects traffic for threats.', capabilities: ['ip', 'routing', 'statefulFirewall', 'appAwareness', 'ips', 'deepInspection'] },
  { id: 'vpn', name: 'VPN Concentrator', category: 'security', icon: LockKeyhole, color: '#df5a60', model: 'VPN-PT' },
  { id: 'internet', name: 'Internet', category: 'wan', icon: Cloud, color: '#4b98d1', ports: '4 network connections', purpose: 'A preconfigured upstream gateway that provisions a connected edge router.', capabilities: ['externalNetwork', 'ispProvisioning'] },
  { id: 'isp-network', name: 'ISP Network', category: 'wan', icon: Network, color: '#4b98d1', ports: '4 provider connections', purpose: 'A preconfigured service-provider handoff for an edge router.', capabilities: ['providerNetwork', 'ispProvisioning'] },
  { id: 'dsl-modem', name: 'DSL Modem', category: 'wan', icon: Box, color: '#4b98d1', ports: '1 DSL · 1 Ethernet', purpose: 'Connects an Ethernet network through a telephone-line service.', capabilities: ['internetAccess', 'mediaConversion'] },
  { id: 'cable-modem', name: 'Cable Modem', category: 'wan', icon: Cable, color: '#4b98d1', ports: '1 coax · 1 Ethernet', purpose: 'Connects an Ethernet network through a cable provider.', capabilities: ['internetAccess', 'mediaConversion'] },
  { id: 'fiber-ont', name: 'Fiber ONT', category: 'wan', icon: Box, color: '#4b98d1', ports: '1 fiber · 1 Ethernet', purpose: 'Terminates a fiber connection and hands off Ethernet.', capabilities: ['internetAccess', 'mediaConversion'] },
  { id: 'cellular-modem', name: 'Cellular Modem', category: 'wan', icon: RadioTower, color: '#4b98d1', ports: '1 cellular · 1 Ethernet', purpose: 'Provides internet access over a mobile network.', capabilities: ['internetAccess', 'mediaConversion'] },
  { id: 'pc', name: 'Desktop PC', category: 'end', icon: Monitor, color: '#647182', model: 'PC-PT' },
  { id: 'laptop', name: 'Laptop', category: 'end', icon: Laptop, color: '#647182', model: 'Laptop-PT' },
  { id: 'server', name: 'Server', category: 'end', icon: Server, color: '#647182', ports: '1 Ethernet interface', purpose: 'Choose a server role before placing it.', capabilities: ['ip'] },
  { id: 'printer', name: 'Printer', category: 'end', icon: Printer, color: '#647182', model: 'Printer-PT' },
  { id: 'ip-phone', name: 'IP Phone', category: 'end', icon: Phone, color: '#647182', model: 'IP Phone 7960' },
  { id: 'tablet', name: 'Tablet', category: 'end', icon: Smartphone, color: '#647182', model: 'Tablet PC' },
  { id: 'tv', name: 'Television', category: 'end', icon: Video, color: '#647182', model: 'TV-PT' },
  { id: 'headset', name: 'Headset', category: 'end', icon: Headphones, color: '#647182', model: 'Headset-PT' },
  { id: 'plc', name: 'PLC', category: 'industrial', icon: Cpu, color: '#d2843e', model: 'PLC-PT' },
  { id: 'motion', name: 'Motion Sensor', category: 'industrial', icon: Gauge, color: '#d2843e', model: 'Motion Sensor' },
  { id: 'smart-door', name: 'Smart Door', category: 'smart', icon: HousePlug, color: '#50a66c', model: 'Door-PT' },
  { id: 'smart-light', name: 'Smart Lamp', category: 'smart', icon: Sparkles, color: '#50a66c', model: 'Light-PT' },
  { id: 'mcu', name: 'Microcontroller', category: 'components', icon: Cpu, color: '#9a6c45', model: 'MCU-PT' },
  { id: 'sbc', name: 'Single Board PC', category: 'components', icon: HardDrive, color: '#9a6c45', model: 'SBC-PT' },
  { id: 'custom', name: 'Custom Device', category: 'components', icon: AppWindow, color: '#9a6c45', model: 'Custom Thing' }
];

const legacyDeviceMigrations = {
  'router-1941': 'router-basic',
  'router-2911': 'router-advanced',
  'router-4321': 'router-advanced',
  'router-pt': 'router-basic',
  firewall: 'firewall-stateful',
  cloud: 'internet',
  dsl: 'dsl-modem'
};

const featureLabels = featureIds => (featureIds || []).map(id => capabilities[id] || id);

const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  if (!dx && !dy) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function parallelConnectionLine(a, b, index, count) {
  const x1 = a.x + 27, y1 = a.y + 23, x2 = b.x + 27, y2 = b.y + 23;
  const length = Math.hypot(x2 - x1, y2 - y1) || 1;
  const offset = (index - (count - 1) / 2) * 9;
  const offsetX = -(y2 - y1) / length * offset;
  const offsetY = (x2 - x1) / length * offset;
  return { x1: x1 + offsetX, y1: y1 + offsetY, x2: x2 + offsetX, y2: y2 + offsetY, midX: (x1 + x2) / 2 + offsetX, midY: (y1 + y2) / 2 + offsetY };
}

function loadSavedDesign() {
  try {
    const saved = JSON.parse(localStorage.getItem('packettracker-design') || '[]');
    if (!Array.isArray(saved)) return [];

    return saved.map(item => {
      const migratedId = legacyDeviceMigrations[item.id] || item.id;
      const catalogDevice = devices.find(device => device.id === migratedId);
      const serverRole = migratedId === 'server' ? serverRoles.find(role => role.id === item.serverRole) : null;
      const restoredDevice = serverRole ? { ...catalogDevice, name: serverRole.name, icon: serverRole.icon, purpose: serverRole.purpose, capabilities: serverRole.capabilities } : catalogDevice;
      const definition = getDeviceDefinition(migratedId);
      const category = categories.find(entry => entry.id === item.category);
      return {
        ...item,
        ...(restoredDevice || {}),
        id: migratedId,
        instanceId: item.instanceId,
        x: item.x,
        y: item.y,
        label: item.customName || (restoredDevice ? restoredDevice.name : item.label),
        interfaces: { ...(definition?.defaults?.interfaces || {}), ...(item.interfaces || {}) },
        switching: item.switching || structuredClone(definition?.defaults?.switching || null),
        ngfw: item.ngfw || structuredClone(definition?.defaults?.ngfw || null),
        routerConfig: item.routerConfig || structuredClone(definition?.defaults?.routerConfig || null),
        icon: restoredDevice?.icon || category?.icon || AppWindow,
        color: restoredDevice?.color || item.color || '#647182'
      };
    });
  } catch {
    localStorage.removeItem('packettracker-design');
    return [];
  }
}

function serializeDesign(items) {
  return items.map(({ icon, ...item }) => item);
}

function App() {
  const [activeCategory, setActiveCategory] = useState('routers');
  const [query, setQuery] = useState('');
  const [placed, setPlaced] = useState(loadSavedDesign);
  const [selected, setSelected] = useState(null);
  const [zoom, setZoom] = useState(100);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inspectorWidth, setInspectorWidth] = useState(() => Math.max(260, Math.min(640, Number(localStorage.getItem('packettracker-inspector-width')) || 292)));
  const [toast, setToast] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [serverPickerOpen, setServerPickerOpen] = useState(false);
  const [serverRoleDraft, setServerRoleDraft] = useState('generic');
  const [serverPickerTarget, setServerPickerTarget] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('packettracker-theme') || 'dark');
  const [activeTool, setActiveTool] = useState('select');
  const [pendingPort, setPendingPort] = useState(null);
  const [portPicker, setPortPicker] = useState(null);
  const [connectPointer, setConnectPointer] = useState(null);
  const [areaSelection, setAreaSelection] = useState(null);
  const [segmentDrawing, setSegmentDrawing] = useState(null);
  const [segmentDraft, setSegmentDraft] = useState({ label: 'Network segment', color: '#5f79ff' });
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedArtifact, setSelectedArtifact] = useState(null);
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [inspectorPanel, setInspectorPanel] = useState('details');
  const [contextMenu, setContextMenu] = useState(null);
  const [cancelToken, setCancelToken] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [connections, setConnections] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem('packettracker-connections') || '[]'); return Array.isArray(saved) ? saved : []; }
    catch { return []; }
  });
  const [notes, setNotes] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem('packettracker-notes') || '[]'); return Array.isArray(saved) ? saved : []; }
    catch { return []; }
  });
  const [segments, setSegments] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem('packettracker-segments') || '[]'); return Array.isArray(saved) ? saved : []; }
    catch { return []; }
  });
  const canvasRef = useRef(null);
  const panRef = useRef(null);
  const clipboardRef = useRef(null);
  const historyRef = useRef({ past: [], future: [], current: null });
  const pendingHistoryRef = useRef(null);
  const historyTimerRef = useRef(null);
  const applyingHistoryRef = useRef(false);
  const conflictSignatureRef = useRef('');
  const [, setHistoryRevision] = useState(0);
  const connectMode = activeTool === 'connect';
  const connectionActive = connectMode || Boolean(pendingPort) || Boolean(portPicker);

  const filtered = useMemo(() => devices.filter(device =>
    (query ? `${device.name} ${device.model || ''} ${device.purpose || ''} ${featureLabels(device.capabilities).join(' ')}`.toLowerCase().includes(query.toLowerCase()) : device.category === activeCategory)
  ), [query, activeCategory]);
  const connectionValidations = useMemo(() => validateConnections(placed, connections), [placed, connections]);
  const duplicateIpConflicts = useMemo(() => findDuplicateIpConflicts(placed, connections), [placed, connections]);
  const duplicateAlerts = useMemo(() => {
    const byAddress = new Map();
    for (const [deviceId, conflicts] of duplicateIpConflicts) {
      const device = placed.find(item => item.instanceId === deviceId);
      for (const conflict of conflicts) {
        if (!byAddress.has(conflict.address)) byAddress.set(conflict.address, new Set());
        byAddress.get(conflict.address).add(device?.customName || device?.name || 'Unknown device');
      }
    }
    return [...byAddress].map(([address, names]) => ({ address, names: [...names] }));
  }, [duplicateIpConflicts, placed]);

  useEffect(() => localStorage.setItem('packettracker-design', JSON.stringify(serializeDesign(placed))), [placed]);
  useEffect(() => localStorage.setItem('packettracker-connections', JSON.stringify(connections)), [connections]);
  useEffect(() => localStorage.setItem('packettracker-notes', JSON.stringify(notes)), [notes]);
  useEffect(() => localStorage.setItem('packettracker-segments', JSON.stringify(segments)), [segments]);
  useEffect(() => localStorage.setItem('packettracker-inspector-width', String(inspectorWidth)), [inspectorWidth]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('packettracker-theme', theme);
  }, [theme]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const signature = duplicateAlerts.map(alert => `${alert.address}:${alert.names.join(',')}`).join('|');
    if (signature && signature !== conflictSignatureRef.current) setToast(`Duplicate IP detected: ${duplicateAlerts.map(alert => alert.address).join(', ')}`);
    conflictSignatureRef.current = signature;
  }, [duplicateAlerts]);
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('pointerdown', close);
    window.addEventListener('blur', close);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('blur', close); };
  }, [contextMenu]);
  useEffect(() => {
    const data = createDesignSnapshot();
    const entry = { data, encoded: JSON.stringify(data) };
    const history = historyRef.current;
    if (!history.current) {
      history.current = entry;
      setHistoryRevision(value => value + 1);
      return;
    }
    if (applyingHistoryRef.current) {
      applyingHistoryRef.current = false;
      history.current = entry;
      pendingHistoryRef.current = null;
      setHistoryRevision(value => value + 1);
      return;
    }
    if (entry.encoded === history.current.encoded) {
      pendingHistoryRef.current = null;
      clearTimeout(historyTimerRef.current);
      return;
    }
    pendingHistoryRef.current = entry;
    clearTimeout(historyTimerRef.current);
    historyTimerRef.current = setTimeout(commitPendingHistory, 180);
    return () => clearTimeout(historyTimerRef.current);
  }, [placed, connections, notes, segments]);
  useEffect(() => {
    function handleShortcut(event) {
      if (event.key === 'Escape') { event.preventDefault(); cancelActiveInteraction(); return; }
      const target = event.target;
      if (target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable)) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 'c') { event.preventDefault(); copySelection(false); }
      else if ((event.ctrlKey || event.metaKey) && key === 'x') { event.preventDefault(); copySelection(true); }
      else if ((event.ctrlKey || event.metaKey) && key === 'v') { event.preventDefault(); pasteSelection(); }
      else if ((event.ctrlKey || event.metaKey) && key === 'z' && !event.shiftKey) { event.preventDefault(); undoDesign(); }
      else if (((event.ctrlKey || event.metaKey) && key === 'y') || ((event.ctrlKey || event.metaKey) && event.shiftKey && key === 'z')) { event.preventDefault(); redoDesign(); }
      else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelection(); }
    }
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [placed, connections, notes, segments, selected, selectedIds, selectedArtifact, selectedConnection]);

  function createDesignSnapshot() {
    return { placed: serializeDesign(placed), connections: structuredClone(connections), notes: structuredClone(notes), segments: structuredClone(segments) };
  }

  function cancelActiveInteraction() {
    if (panRef.current && canvasRef.current) {
      canvasRef.current.scrollLeft = panRef.current.scrollLeft;
      canvasRef.current.scrollTop = panRef.current.scrollTop;
      panRef.current = null;
      setIsPanning(false);
    }
    setCancelToken(value => value + 1);
    setActiveTool('select');
    setPendingPort(null);
    setPortPicker(null);
    setConnectPointer(null);
    setAreaSelection(null);
    setSegmentDrawing(null);
    setContextMenu(null);
    setProfileOpen(false);
    setServerPickerOpen(false);
    setServerPickerTarget(null);
    setToast('Interaction cancelled');
  }

  function commitPendingHistory() {
    const pending = pendingHistoryRef.current;
    const history = historyRef.current;
    if (!pending || pending.encoded === history.current?.encoded) return;
    history.past.push(history.current);
    if (history.past.length > 100) history.past.shift();
    history.current = pending;
    history.future = [];
    pendingHistoryRef.current = null;
    setHistoryRevision(value => value + 1);
  }

  function restoreDesign(snapshot) {
    const hydrated = snapshot.placed.map(item => {
      const catalogDevice = devices.find(device => device.id === item.id);
      const category = categories.find(entry => entry.id === item.category);
      const role = item.id === 'server' ? serverRoles.find(serverRole => serverRole.id === item.serverRole) : null;
      const definition = getDeviceDefinition(item.id);
      return { ...item, ngfw: item.ngfw || structuredClone(definition?.defaults?.ngfw || null), routerConfig: item.routerConfig || structuredClone(definition?.defaults?.routerConfig || null), icon: role?.icon || catalogDevice?.icon || category?.icon || AppWindow };
    });
    applyingHistoryRef.current = true;
    setPlaced(hydrated);
    setConnections(structuredClone(snapshot.connections));
    setNotes(structuredClone(snapshot.notes));
    setSegments(structuredClone(snapshot.segments));
    setSelected(null); setSelectedIds([]); setSelectedArtifact(null); setSelectedConnection(null);
  }

  function undoDesign() {
    commitPendingHistory();
    const history = historyRef.current;
    const previous = history.past.pop();
    if (!previous) return setToast('Nothing to undo');
    history.future.push(history.current);
    history.current = previous;
    restoreDesign(previous.data);
    setToast('Undid last change');
  }

  function redoDesign() {
    commitPendingHistory();
    const history = historyRef.current;
    const next = history.future.pop();
    if (!next) return setToast('Nothing to redo');
    history.past.push(history.current);
    history.current = next;
    restoreDesign(next.data);
    setToast('Redid change');
  }

  function selectedDeviceIds() {
    if (selectedIds.length) return selectedIds;
    return selected ? [selected] : [];
  }

  function copySelection(cut) {
    const deviceIds = selectedDeviceIds();
    let payload = null;
    if (deviceIds.length) {
      const idSet = new Set(deviceIds);
      payload = {
        kind: 'devices',
        devices: serializeDesign(placed.filter(item => idSet.has(item.instanceId))),
        connections: structuredClone(connections.filter(connection => idSet.has(connection.a.deviceId) && idSet.has(connection.b.deviceId)))
      };
    } else if (selectedArtifact?.type === 'note') {
      const note = notes.find(item => item.id === selectedArtifact.id);
      if (note) payload = { kind: 'note', item: structuredClone(note) };
    } else if (selectedArtifact?.type === 'segment') {
      const segment = segments.find(item => item.id === selectedArtifact.id);
      if (segment) payload = { kind: 'segment', item: structuredClone(segment) };
    }
    if (!payload) return setToast('Select something to copy');
    clipboardRef.current = payload;
    if (cut) {
      deleteSelection(false);
      setToast('Cut to clipboard');
    } else setToast('Copied to clipboard');
  }

  function pasteSelection() {
    const clipboard = clipboardRef.current;
    if (!clipboard) return setToast('Clipboard is empty');
    if (clipboard.kind === 'devices') {
      const idMap = new Map();
      const pasted = clipboard.devices.map(item => {
        const instanceId = uid();
        idMap.set(item.instanceId, instanceId);
        const catalogDevice = devices.find(device => device.id === item.id);
        const category = categories.find(entry => entry.id === item.category);
        const role = item.id === 'server' ? serverRoles.find(serverRole => serverRole.id === item.serverRole) : null;
        return { ...structuredClone(item), instanceId, x: item.x + 30, y: item.y + 30, icon: role?.icon || catalogDevice?.icon || category?.icon || AppWindow };
      });
      const pastedConnections = clipboard.connections.map(connection => ({ id: uid(), a: { ...connection.a, deviceId: idMap.get(connection.a.deviceId) }, b: { ...connection.b, deviceId: idMap.get(connection.b.deviceId) } }));
      setPlaced(current => [...current, ...pasted]);
      setConnections(current => [...current, ...pastedConnections]);
      setSelected(null); setSelectedIds(pasted.map(item => item.instanceId)); setSelectedArtifact(null);
    } else if (clipboard.kind === 'note') {
      const item = { ...structuredClone(clipboard.item), id: uid(), x: clipboard.item.x + 30, y: clipboard.item.y + 30 };
      setNotes(current => [...current, item]); setSelectedArtifact({ type: 'note', id: item.id }); setSelected(null); setSelectedIds([]);
    } else {
      const item = { ...structuredClone(clipboard.item), id: uid(), x: clipboard.item.x + 30, y: clipboard.item.y + 30 };
      setSegments(current => [...current, item]); setSelectedArtifact({ type: 'segment', id: item.id }); setSelected(null); setSelectedIds([]);
    }
    setToast('Pasted with 30px offset');
  }

  function deleteSelection(showToast = true) {
    if (selectedConnection) {
      removeConnectionById(selectedConnection);
      setSelectedConnection(null);
      if (showToast) setToast('Connection deleted');
      return;
    }
    const deviceIds = selectedDeviceIds();
    if (deviceIds.length) {
      const idSet = new Set(deviceIds);
      setPlaced(current => current.filter(item => !idSet.has(item.instanceId)));
      setConnections(current => current.filter(connection => !idSet.has(connection.a.deviceId) && !idSet.has(connection.b.deviceId)));
      setSelected(null); setSelectedIds([]);
      if (showToast) setToast(`Deleted ${deviceIds.length} ${deviceIds.length === 1 ? 'device' : 'devices'}`);
      return;
    }
    if (selectedArtifact?.type === 'note') setNotes(current => current.filter(item => item.id !== selectedArtifact.id));
    else if (selectedArtifact?.type === 'segment') setSegments(current => current.filter(item => item.id !== selectedArtifact.id));
    else return showToast && setToast('Select something to delete');
    setSelectedArtifact(null);
    if (showToast) setToast('Deleted selection');
  }

  function removeConnectionById(connectionId) {
    const connection = connections.find(item => item.id === connectionId);
    if (connection?.provisioning) {
      const { edgeId, edgePort } = connection.provisioning;
      setPlaced(current => current.map(item => {
        if (item.instanceId !== edgeId) return item;
        const interfaces = { ...(item.interfaces || {}) };
        const ispProvisioning = { ...(item.ispProvisioning || {}) };
        delete interfaces[edgePort]; delete ispProvisioning[edgePort];
        return { ...item, interfaces, ispProvisioning, gateway: null };
      }));
    }
    setConnections(current => current.filter(item => item.id !== connectionId));
  }

  function addDevice(device, point) {
    const canvas = canvasRef.current?.getBoundingClientRect();
    const x = point ? (point.clientX - canvas.left) / (zoom / 100) : 160 + (placed.length % 5) * 115;
    const y = point ? (point.clientY - canvas.top) / (zoom / 100) : 130 + Math.floor(placed.length / 5) * 105;
    const definition = getDeviceDefinition(device.id);
    const item = {
      ...device,
      instanceId: uid(),
      x: Math.max(30, x - 27),
      y: Math.max(30, y - 23),
      label: device.name,
      interfaces: structuredClone(definition?.defaults?.interfaces || {}),
      switching: structuredClone(definition?.defaults?.switching || null),
      ngfw: structuredClone(definition?.defaults?.ngfw || null),
      routerConfig: structuredClone(definition?.defaults?.routerConfig || null)
    };
    setPlaced(current => [...current, item]);
    setSelected(item.instanceId);
    setSelectedArtifact(null);
    setSelectedConnection(null);
  }

  function chooseDevice(device) {
    if (device.id === 'server') {
      setServerPickerTarget(null);
      setServerPickerOpen(true);
      return;
    }
    addDevice(device);
  }

  function handleDeviceDragStart(event, device) {
    if (device.id === 'server') {
      event.preventDefault();
      setServerPickerTarget(null);
      setServerPickerOpen(true);
      return;
    }
    event.dataTransfer.setData('deviceId', device.id);
  }

  function placeConfiguredServer() {
    const role = serverRoles.find(item => item.id === serverRoleDraft) || serverRoles[0];
    const configured = {
      ...devices.find(device => device.id === 'server'),
      name: role.name,
      label: role.name,
      icon: role.icon,
      purpose: role.purpose,
      capabilities: role.capabilities,
      serverRole: role.id,
      services: role.capabilities.filter(capability => capability.endsWith('Service'))
    };
    if (serverPickerTarget) {
      setPlaced(current => current.map(item => item.instanceId === serverPickerTarget ? { ...item, ...configured, label: role.name } : item));
      setToast(`${role.name} configuration applied`);
    } else {
      addDevice(configured);
      setToast(`${role.name} placed`);
    }
    setServerPickerOpen(false);
    setServerPickerTarget(null);
  }

  function moveDevice(instanceId, x, y) {
    setPlaced(current => {
      const anchor = current.find(item => item.instanceId === instanceId);
      if (!anchor) return current;
      if (selectedIds.length > 1 && selectedIds.includes(instanceId)) {
        const dx = x - anchor.x, dy = y - anchor.y;
        const selectedSet = new Set(selectedIds);
        return current.map(item => selectedSet.has(item.instanceId) ? { ...item, x: Math.max(8, item.x + dx), y: Math.max(8, item.y + dy) } : item);
      }
      return current.map(item => item.instanceId === instanceId ? { ...item, x, y } : item);
    });
  }

  function updateInterface(instanceId, interfaceId, field, value) {
    setPlaced(current => current.map(item => item.instanceId === instanceId ? {
      ...item,
      interfaces: {
        ...(item.interfaces || {}),
        [interfaceId]: {
          ...(item.interfaces?.[interfaceId] || {}),
          prefix: item.interfaces?.[interfaceId]?.prefix ?? 24,
          [field]: field === 'prefix' ? Math.max(0, Math.min(32, Number(value))) : value
        }
      }
    } : item));
  }

  function updateSwitching(instanceId, switching, saved = false) {
    setPlaced(current => current.map(item => item.instanceId === instanceId ? { ...item, switching, ...(saved ? { startupSwitching: structuredClone(switching) } : {}) } : item));
  }

  function updateNgfw(instanceId, ngfw, interfaces, saved = false) {
    setPlaced(current => current.map(item => item.instanceId === instanceId ? { ...item, ngfw, interfaces, ...(saved ? { startupNgfw: structuredClone(ngfw), startupInterfaces: structuredClone(interfaces) } : {}) } : item));
  }

  function updateRouter(instanceId, routerConfig, interfaces, saved = false) {
    setPlaced(current => current.map(item => item.instanceId === instanceId ? { ...item, routerConfig, interfaces, ...(saved ? { startupRouterConfig: structuredClone(routerConfig), startupInterfaces: structuredClone(interfaces) } : {}) } : item));
  }

  function updateDeviceName(instanceId, customName) {
    const name = customName.trim();
    setPlaced(current => current.map(item => item.instanceId === instanceId ? { ...item, customName: name, label: name || item.name } : item));
  }

  function connectPort(deviceId, portId) {
    const endpoint = { deviceId, portId };
    const selectedDevice = placed.find(item => item.instanceId === deviceId);
    if (selectedDevice?.switching?.ports?.[portId]?.enabled === false) return setToast('That switch port is shutdown. Use "no shutdown" before connecting it');
    const inUse = connections.some(connection => [connection.a, connection.b].some(end => end.deviceId === deviceId && end.portId === portId));
    if (inUse) return setToast('That port is already connected');
    if (!pendingPort) {
      setPendingPort(endpoint);
      const device = placed.find(item => item.instanceId === deviceId);
      if (device) setConnectPointer({ x: device.x + 27, y: device.y + 23 });
      setToast('Choose a port on another device');
      return;
    }
    if (pendingPort.deviceId === deviceId) return setToast('Choose a different device');
    const firstDevice = placed.find(item => item.instanceId === pendingPort.deviceId);
    const secondDevice = placed.find(item => item.instanceId === deviceId);
    const firstPort = getDeviceDefinition(firstDevice?.id)?.ports.find(port => port.id === pendingPort.portId);
    const secondPort = getDeviceDefinition(secondDevice?.id)?.ports.find(port => port.id === portId);
    const firstWireless = ['wireless', 'endpoint-wireless'].includes(firstPort?.kind);
    const secondWireless = ['wireless', 'endpoint-wireless'].includes(secondPort?.kind);
    if (firstWireless !== secondWireless) return setToast('Wireless and Ethernet ports cannot be cabled together');
    const provisioning = provisionIspConnection(pendingPort, endpoint);
    if (provisioning?.error) return setToast(provisioning.error);
    setConnections(current => [...current, { id: uid(), a: pendingPort, b: endpoint, color: '#6e7d89', label: '', ...(provisioning ? { provisioning } : {}) }]);
    setPendingPort(null);
    setConnectPointer(null);
    if (!provisioning) setToast('Devices connected');
  }

  function provisionIspConnection(first, second) {
    const match = [[first, second], [second, first]].find(([providerEnd, edgeEnd]) => {
      const provider = placed.find(item => item.instanceId === providerEnd.deviceId);
      const edge = placed.find(item => item.instanceId === edgeEnd.deviceId);
      const edgePort = getDeviceDefinition(edge?.id)?.ports.find(port => port.id === edgeEnd.portId);
      return ['internet', 'isp-network'].includes(provider?.id) && edge?.id.startsWith('router-') && edgePort?.kind === 'routed';
    });
    if (!match) return null;
    const [providerEnd, edgeEnd] = match;
    if (connections.some(connection => connection.provisioning?.providerId === providerEnd.deviceId)) return { error: 'This ISP /30 handoff already has an edge router' };
    const edge = placed.find(item => item.instanceId === edgeEnd.deviceId);
    const provisioning = { providerId: providerEnd.deviceId, providerPort: providerEnd.portId, edgeId: edgeEnd.deviceId, edgePort: edgeEnd.portId, address: '203.0.113.2', prefix: 30, subnetMask: '255.255.255.252', gateway: '203.0.113.1' };
    setPlaced(current => current.map(item => item.instanceId === edge.instanceId ? {
      ...item,
      gateway: provisioning.gateway,
      interfaces: { ...(item.interfaces || {}), [edgeEnd.portId]: { address: provisioning.address, prefix: provisioning.prefix, provisioned: true } },
      ispProvisioning: { ...(item.ispProvisioning || {}), [edgeEnd.portId]: provisioning }
    } : item));
    setToast(`ISP assigned ${provisioning.address}/${provisioning.prefix} to ${edge.customName || edge.name}`);
    return provisioning;
  }

  function chooseConnectionPort(portId) {
    if (!portPicker) return;
    const { deviceId, startFresh } = portPicker;
    setPortPicker(null);
    if (startFresh) {
      const device = placed.find(item => item.instanceId === deviceId);
      setPendingPort({ deviceId, portId });
      if (device) setConnectPointer({ x: device.x + 27, y: device.y + 23 });
      setToast('Now click the destination device');
      return;
    }
    connectPort(deviceId, portId);
  }

  function connectDevice(deviceId, startFresh = false) {
    const device = placed.find(item => item.instanceId === deviceId);
    const definition = getDeviceDefinition(device?.id);
    if (!definition) return setToast('This device does not have connectable ports yet');
    const activePendingPort = startFresh ? null : pendingPort;
    if (activePendingPort?.deviceId === deviceId) return setToast('Choose a different device');

    const sourceDevice = activePendingPort && placed.find(item => item.instanceId === activePendingPort.deviceId);
    const sourcePort = activePendingPort && getDeviceDefinition(sourceDevice?.id)?.ports.find(port => port.id === activePendingPort.portId);
    const sourceWireless = sourcePort && ['wireless', 'endpoint-wireless'].includes(sourcePort.kind);
    const availablePorts = definition.ports.filter(port => {
      const inUse = connections.some(connection => [connection.a, connection.b].some(end => end.deviceId === deviceId && end.portId === port.id));
      const wireless = ['wireless', 'endpoint-wireless'].includes(port.kind);
      const enabled = device.switching?.ports?.[port.id]?.enabled !== false;
      return !inUse && enabled && (!sourcePort || wireless === sourceWireless);
    });
    if (!availablePorts.length) return setToast(sourcePort ? 'No compatible enabled port is available on that device' : 'That device has no enabled free ports');
    setSelected(deviceId);
    setInspectorPanel('details');
    const requiresExplicitPort = availablePorts.length > 1 && (device.id === 'switch-managed' || device.id.startsWith('firewall-') || device.id.startsWith('router-'));
    if (requiresExplicitPort) {
      setPortPicker({ deviceId, ports: availablePorts, startFresh, destination: Boolean(activePendingPort) });
      return;
    }
    if (startFresh) {
      const endpoint = { deviceId, portId: availablePorts[0].id };
      setPendingPort(endpoint);
      setConnectPointer({ x: device.x + 27, y: device.y + 23 });
      setToast('Now click the destination device');
      return;
    }
    connectPort(deviceId, availablePorts[0].id);
  }

  function setTool(tool) {
    setActiveTool(tool);
    setPendingPort(null);
    setPortPicker(null);
    setConnectPointer(null);
    setAreaSelection(null);
    setSegmentDrawing(null);
    if (tool !== 'area') setSelectedIds([]);
  }

  function canvasPoint(event) {
    const canvas = canvasRef.current;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left + canvas.scrollLeft) / (zoom / 100),
      y: (event.clientY - bounds.top + canvas.scrollTop) / (zoom / 100)
    };
  }

  function handleCanvasPointerDown(event) {
    setContextMenu(null);
    if (event.target.closest('.placed-device, .note-card, .empty-state')) return;
    const point = canvasPoint(event);
    if (activeTool === 'connect') {
      if (pendingPort) {
        setPendingPort(null);
        setConnectPointer(null);
        setToast('Connection cancelled');
      }
      return;
    }
    if (activeTool === 'note') {
      const note = { id: uid(), x: point.x, y: point.y, text: '' };
      setNotes(current => [...current, note]);
      setSelected(null);
      setToast('Note added — start typing');
      return;
    }
    if (activeTool === 'area') {
      setSelected(null);
      setSelectedArtifact(null);
      setSelectedConnection(null);
      setSelectedIds([]);
      setAreaSelection({ startX: point.x, startY: point.y, x: point.x, y: point.y });
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (activeTool === 'segment') {
      setSegmentDrawing({ startX: point.x, startY: point.y, x: point.x, y: point.y });
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (activeTool === 'select') {
      setSelected(null);
      setSelectedIds([]);
      setSelectedArtifact(null);
      setSelectedConnection(null);
      if (event.button === 0) {
        panRef.current = { clientX: event.clientX, clientY: event.clientY, scrollLeft: event.currentTarget.scrollLeft, scrollTop: event.currentTarget.scrollTop };
        setIsPanning(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    }
  }

  function handleCanvasPointerMove(event) {
    if (panRef.current) {
      const canvas = event.currentTarget;
      canvas.scrollLeft = panRef.current.scrollLeft - (event.clientX - panRef.current.clientX);
      canvas.scrollTop = panRef.current.scrollTop - (event.clientY - panRef.current.clientY);
      event.preventDefault();
      return;
    }
    if (pendingPort) setConnectPointer(canvasPoint(event));
    if (segmentDrawing && activeTool === 'segment') {
      const point = canvasPoint(event);
      setSegmentDrawing(current => ({ ...current, x: point.x, y: point.y }));
      return;
    }
    if (!areaSelection || activeTool !== 'area') return;
    const point = canvasPoint(event);
    setAreaSelection(current => ({ ...current, x: point.x, y: point.y }));
  }

  function handleCanvasPointerUp(event) {
    if (panRef.current) {
      panRef.current = null;
      setIsPanning(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    if (segmentDrawing && activeTool === 'segment') {
      const point = canvasPoint(event);
      const x = Math.min(segmentDrawing.startX, point.x), y = Math.min(segmentDrawing.startY, point.y);
      const width = Math.abs(point.x - segmentDrawing.startX), height = Math.abs(point.y - segmentDrawing.startY);
      if (width >= 40 && height >= 30) {
        setSegments(current => [...current, { id: uid(), x, y, width, height, label: segmentDraft.label.trim() || 'Network segment', color: segmentDraft.color }]);
        setToast('Network segment added');
      } else setToast('Drag a larger box for the segment');
      setSegmentDrawing(null);
      return;
    }
    if (!areaSelection || activeTool !== 'area') return;
    const point = canvasPoint(event);
    const left = Math.min(areaSelection.startX, point.x), right = Math.max(areaSelection.startX, point.x);
    const top = Math.min(areaSelection.startY, point.y), bottom = Math.max(areaSelection.startY, point.y);
    const matches = placed.filter(item => item.x + 27 >= left && item.x + 27 <= right && item.y + 23 >= top && item.y + 23 <= bottom).map(item => item.instanceId);
    setSelectedIds(matches);
    setAreaSelection(null);
    setToast(`${matches.length} ${matches.length === 1 ? 'device' : 'devices'} selected`);
  }

  function handleCanvasContextMenu(event) {
    const point = canvasPoint(event);
    let closest = null;
    for (const connection of connections) {
      const a = placed.find(item => item.instanceId === connection.a.deviceId);
      const b = placed.find(item => item.instanceId === connection.b.deviceId);
      if (!a || !b) continue;
      const distance = pointToSegmentDistance(point.x, point.y, a.x + 27, a.y + 23, b.x + 27, b.y + 23);
      if (!closest || distance < closest.distance) closest = { connection, distance };
    }
    if (!closest || closest.distance > 14 / (zoom / 100)) return;
    event.preventDefault(); event.stopPropagation();
    setSelectedConnection(closest.connection.id); setSelected(null); setSelectedIds([]); setSelectedArtifact(null);
    setContextMenu({ type: 'connection', x: event.clientX, y: event.clientY, connectionId: closest.connection.id });
  }

  function clearCanvas() {
    if (!placed.length && !notes.length && !segments.length) return;
    setPlaced([]);
    setConnections([]);
    setNotes([]);
    setSegments([]);
    setSelected(null);
    setToast('Workspace cleared');
  }

  function saveDesign() {
    localStorage.setItem('packettracker-design', JSON.stringify(serializeDesign(placed)));
    setToast('Design saved locally');
  }

  function exportDesign() {
    const blob = new Blob([JSON.stringify({ version: 2, name: 'Untitled Network', devices: serializeDesign(placed), connections, notes, segments }, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'untitled-network.packettracker.json';
    link.click();
    URL.revokeObjectURL(link.href);
    setToast('Design exported');
  }

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><Network size={20}/></div><span>Packet<span>Tracker</span></span></div>
      <div className="file-name"><span>Untitled Network</span><ChevronDown size={14}/></div>
      <div className="top-actions">
        <button className="icon-button" title="Undo (Ctrl+Z)" disabled={!historyRef.current.past.length && !pendingHistoryRef.current} onClick={undoDesign}><Undo2 size={17}/></button>
        <button className="icon-button" title="Redo (Ctrl+Y)" disabled={!historyRef.current.future.length} onClick={redoDesign}><Redo2 size={17}/></button>
        <div className="divider" />
        <button className="button secondary" onClick={exportDesign}><Download size={16}/> Export</button>
        <button className="button primary" onClick={saveDesign}><Save size={16}/> Save design</button>
        <div className="profile-wrap">
          <button className="avatar" onClick={() => setProfileOpen(value => !value)} aria-expanded={profileOpen} aria-label="Open profile settings">TF</button>
          {profileOpen && <div className="profile-menu">
            <div className="profile-summary"><span>TF</span><div><strong>Profile settings</strong><small>Local preferences</small></div></div>
            <button className="theme-toggle" onClick={() => setTheme(current => current === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <Moon size={16}/> : <Sun size={16}/>}<span><strong>Dark mode</strong><small>{theme === 'dark' ? 'On' : 'Off'}</small></span><i className={theme === 'dark' ? 'on' : ''}><b/></i>
            </button>
          </div>}
        </div>
      </div>
    </header>

    <main className="workspace">
      <aside className={`sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
        <div className="sidebar-header"><span>Device library</span><button className="icon-button" onClick={() => setSidebarOpen(false)}><PanelLeftClose size={17}/></button></div>
        <div className="search"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search devices" />{query && <button onClick={() => setQuery('')}><X size={14}/></button>}</div>
        <div className="library-body">
          <nav className="categories">
            {categories.map(category => <button key={category.id} className={activeCategory === category.id && !query ? 'active' : ''} onClick={() => { setActiveCategory(category.id); setQuery(''); }}>
              <category.icon size={18}/><span>{category.label}</span><ChevronRight size={14}/>
            </button>)}
          </nav>
          <section className="device-panel">
            <div className="panel-title"><div><strong>{query ? 'Search results' : categories.find(c => c.id === activeCategory)?.label}</strong><span>{filtered.length} devices</span></div><button className="icon-button"><Ellipsis size={17}/></button></div>
            <div className="device-grid">
              {filtered.map(device => <button key={device.id} className="device-card" aria-label={`Add ${device.name}`} draggable onDragStart={event => handleDeviceDragStart(event, device)} onClick={() => chooseDevice(device)}>
                <div className="device-icon" style={{ '--device-color': device.color }}><device.icon size={25}/></div>
                <div className="device-summary">
                  <span>{device.name}</span>
                  <p>{device.purpose || device.model || 'A general-purpose network device.'}</p>
                  <small>{device.ports || 'Port details coming soon'}</small>
                  {device.id === 'server' && <div className="server-role-preview">{serverRoles.map(role => <span key={role.id}>{role.name.replace(' Server', '')}</span>)}</div>}
                  {!!device.capabilities?.length && <div className="capability-list">{featureLabels(device.capabilities).map(feature => <span key={feature}>{feature}</span>)}</div>}
                </div>
              </button>)}
            </div>
            <div className="drag-hint"><MousePointer2 size={15}/> Drag a device to the workspace, or click to add</div>
          </section>
        </div>
      </aside>

      {!sidebarOpen && <button className="sidebar-opener" onClick={() => setSidebarOpen(true)}><PanelLeftOpen size={18}/></button>}

      <section className="canvas-wrap">
        <div className="canvas-toolbar">
          <button className={`tool ${activeTool === 'select' ? 'active' : ''}`} onClick={() => setTool('select')}><MousePointer2 size={17}/><span>Select</span></button>
          <button className={`tool ${activeTool === 'connect' ? 'active' : ''}`} onClick={() => setTool('connect')}><Cable size={17}/><span>Connect</span></button>
          <button className={`tool ${activeTool === 'area' ? 'active' : ''}`} onClick={() => setTool('area')}><SquareDashedMousePointer size={17}/><span>Area</span></button>
          <button className={`tool ${activeTool === 'segment' ? 'active' : ''}`} onClick={() => setTool('segment')}><Box size={17}/><span>Add segment</span></button>
          <div className="divider" />
          <button className={`tool ${activeTool === 'note' ? 'active' : ''}`} onClick={() => setTool('note')}><FilePlus2 size={17}/><span>Note</span></button>
          <div className="divider" />
          <button className="tool zoom-tool" title="Zoom out" aria-label="Zoom out" disabled={zoom <= 50} onClick={() => setZoom(value => Math.max(50, value - 10))}><ZoomOut size={17}/></button>
          <span className="toolbar-zoom-value" aria-label={`Current zoom ${zoom}%`}>{zoom}%</span>
          <button className="tool zoom-tool" title="Zoom in" aria-label="Zoom in" disabled={zoom >= 150} onClick={() => setZoom(value => Math.min(150, value + 10))}><ZoomIn size={17}/></button>
        </div>
        {!!duplicateAlerts.length && <div className="topology-alert" role="alert"><TriangleAlert size={17}/><div><strong>Duplicate IP address detected</strong><span>{duplicateAlerts.map(alert => `${alert.address} — ${alert.names.join(' and ')}`).join(' · ')}</span></div></div>}
        {activeTool !== 'select' && <div className="mode-hint">
          {activeTool === 'connect' && (pendingPort ? 'Now click the destination device to create the link' : 'Click the first device, then click the device you want to link')}
          {activeTool === 'area' && 'Drag across the canvas to select multiple devices'}
          {activeTool === 'note' && 'Click anywhere on the canvas to place a note'}
          {activeTool === 'segment' && 'Choose a label and color, then drag a box on the canvas'}
        </div>}
        {activeTool === 'segment' && <div className="segment-controls" onPointerDown={event => event.stopPropagation()}>
          <input aria-label="Segment label" value={segmentDraft.label} onChange={event => setSegmentDraft(current => ({ ...current, label: event.target.value }))} placeholder="Segment label" />
          <div className="segment-colors" aria-label="Segment color">{['#5f79ff', '#16a3a6', '#50a66c', '#d68a28', '#df5a60', '#7c62c8'].map(color => <button key={color} aria-label={`Use ${color}`} className={segmentDraft.color === color ? 'active' : ''} style={{ background: color }} onClick={() => setSegmentDraft(current => ({ ...current, color }))}/>)}</div>
        </div>}
        <div ref={canvasRef} className={`canvas tool-${connectionActive ? 'connect' : activeTool} ${isPanning ? 'panning' : ''}`} onContextMenu={handleCanvasContextMenu} onDragOver={e => e.preventDefault()} onDrop={e => {
          e.preventDefault(); const device = devices.find(d => d.id === e.dataTransfer.getData('deviceId')); if (device) addDevice(device, e);
        }} onPointerDown={handleCanvasPointerDown} onPointerMove={handleCanvasPointerMove} onPointerUp={handleCanvasPointerUp} onPointerCancel={handleCanvasPointerUp}>
          <div className="canvas-content" style={{ transform: `scale(${zoom / 100})` }}>
            {segments.map(segment => <NetworkSegment key={segment.id} segment={segment} selected={selectedArtifact?.type === 'segment' && selectedArtifact.id === segment.id} zoom={zoom} cancelToken={cancelToken} onSelect={() => { setSelectedArtifact({ type: 'segment', id: segment.id }); setSelected(null); setSelectedIds([]); setSelectedConnection(null); }} onChange={updates => setSegments(current => current.map(item => item.id === segment.id ? { ...item, ...updates } : item))} onDelete={() => { setSegments(current => current.filter(item => item.id !== segment.id)); setSelectedArtifact(null); }}/>) }
            {segmentDrawing && <div className="network-segment drawing" style={{
              '--segment-color': segmentDraft.color,
              left: Math.min(segmentDrawing.startX, segmentDrawing.x),
              top: Math.min(segmentDrawing.startY, segmentDrawing.y),
              width: Math.abs(segmentDrawing.x - segmentDrawing.startX),
              height: Math.abs(segmentDrawing.y - segmentDrawing.startY)
            }}><span>{segmentDraft.label || 'Network segment'}</span></div>}
            <svg className="connection-layer" width="2800" height="1800" aria-label="Network connections">
              {connections.map(connection => {
                const a = placed.find(item => item.instanceId === connection.a.deviceId);
                const b = placed.find(item => item.instanceId === connection.b.deviceId);
                const validation = connectionValidations.get(connection.id);
                return a && b ? <g key={connection.id} className={`${selectedConnection === connection.id ? 'selected' : ''} status-${validation?.status || 'unevaluated'} ${validation?.type === 'Trunk' ? 'trunk' : ''}`} style={{ '--connection-label-color': connection.color || '#6e7d89' }}>
                  {validation?.type === 'Trunk' && validation.vlanStatuses?.length ? validation.vlanStatuses.map((vlanState, index) => {
                    const line = parallelConnectionLine(a, b, index, validation.vlanStatuses.length);
                    return <g className={`trunk-strand ${vlanState.status}`} key={vlanState.vlan}>
                      <line className="connection-status-outline" x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}/>
                      <line className="connection-line" x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}/>
                      <text className="vlan-strand-label" x={line.midX} y={line.midY - 4} textAnchor="middle">VLAN {vlanState.vlan}</text>
                    </g>;
                  }) : <><line className="connection-status-outline" x1={a.x + 27} y1={a.y + 23} x2={b.x + 27} y2={b.y + 23}/><line className="connection-line" x1={a.x + 27} y1={a.y + 23} x2={b.x + 27} y2={b.y + 23}/></>}
                  {connection.label && <text className="connection-label" x={(a.x + b.x) / 2 + 27} y={(a.y + b.y) / 2 + 18} textAnchor="middle">{connection.label}</text>}
                  <line className="connection-hit" style={{ strokeWidth: Math.max(20, (validation?.vlanStatuses?.length || 1) * 9 + 12) }} x1={a.x + 27} y1={a.y + 23} x2={b.x + 27} y2={b.y + 23} onPointerDown={event => { event.stopPropagation(); setContextMenu(null); setSelectedConnection(connection.id); setSelected(null); setSelectedIds([]); setSelectedArtifact(null); }} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); setSelectedConnection(connection.id); setSelected(null); setSelectedIds([]); setSelectedArtifact(null); setContextMenu({ type: 'connection', x: event.clientX, y: event.clientY, connectionId: connection.id }); }}/>
                </g> : null;
              })}
              {pendingPort && connectPointer && (() => {
                const source = placed.find(item => item.instanceId === pendingPort.deviceId);
                return source ? <line className="connection-preview" x1={source.x + 27} y1={source.y + 23} x2={connectPointer.x} y2={connectPointer.y}/> : null;
              })()}
            </svg>
            {areaSelection && <div className="selection-box" style={{
              left: Math.min(areaSelection.startX, areaSelection.x),
              top: Math.min(areaSelection.startY, areaSelection.y),
              width: Math.abs(areaSelection.x - areaSelection.startX),
              height: Math.abs(areaSelection.y - areaSelection.startY)
            }}/>} 
            {!placed.length && <div className="empty-state">
              <div className="empty-illustration"><Router size={32}/><span className="line one"/><span className="line two"/><Monitor className="pc-one" size={27}/><Server className="pc-two" size={27}/></div>
              <h2>Build your first network</h2>
              <p>Drag devices from the library onto the workspace.<br/>Start with a router, switch, and a few end devices.</p>
              <button className="button primary" onClick={() => addDevice(devices[0])}><Plus size={16}/> Add a router</button>
            </div>}
            {notes.map(note => <CanvasNote key={note.id} note={note} selected={selectedArtifact?.type === 'note' && selectedArtifact.id === note.id} onSelect={() => { setSelectedArtifact({ type: 'note', id: note.id }); setSelected(null); setSelectedIds([]); setSelectedConnection(null); }} onChange={text => setNotes(current => current.map(item => item.id === note.id ? { ...item, text } : item))} onDelete={() => { setNotes(current => current.filter(item => item.id !== note.id)); setSelectedArtifact(null); }}/>) }
            {placed.map(item => <PlacedDevice key={item.instanceId} item={item} ipConflicts={duplicateIpConflicts.get(item.instanceId) || []} selected={selected === item.instanceId || selectedIds.includes(item.instanceId)} interactionMode={connectionActive ? 'connect' : activeTool} cancelToken={cancelToken} onConnect={connectDevice} onContextMenu={event => {
              event.preventDefault(); event.stopPropagation();
              setSelected(item.instanceId); setSelectedIds([]); setSelectedArtifact(null); setSelectedConnection(null);
              setContextMenu({ x: event.clientX, y: event.clientY, deviceId: item.instanceId, managed: item.id === 'switch-managed' || item.id === 'firewall-ngfw', server: item.id === 'server', serverRole: item.serverRole || 'generic' });
            }} onSelect={instanceId => { setSelected(instanceId); if (!selectedIds.includes(instanceId)) setSelectedIds([]); setSelectedArtifact(null); setSelectedConnection(null); setInspectorPanel('details'); }} onMove={moveDevice} onDelete={() => { setPlaced(current => current.filter(d => d.instanceId !== item.instanceId)); setConnections(current => current.filter(connection => connection.a.deviceId !== item.instanceId && connection.b.deviceId !== item.instanceId)); setSelected(null); setSelectedConnection(null); }} />)}
          </div>
        </div>
        <div className="statusbar">
          <div><span className="status-dot"/> Logical workspace <span className="separator">•</span> {placed.length} {placed.length === 1 ? 'device' : 'devices'}{selectedIds.length > 0 && ` · ${selectedIds.length} selected`}</div>
          <div className="zoom-control"><button onClick={() => setZoom(z => Math.max(50, z - 10))}><ZoomOut size={16}/></button><input type="range" min="50" max="150" value={zoom} onChange={e => setZoom(Number(e.target.value))}/><span>{zoom}%</span><button onClick={() => setZoom(z => Math.min(150, z + 10))}><ZoomIn size={16}/></button><button onClick={() => setZoom(100)}><RotateCcw size={14}/></button></div>
        </div>
        {selected && <DeviceInspector
          item={placed.find(item => item.instanceId === selected)}
          onClose={() => setSelected(null)}
          onInterfaceChange={updateInterface}
          connectMode={connectMode}
          pendingPort={pendingPort}
          connections={connections}
          allDevices={placed}
          onConnectPort={connectPort}
          panel={inspectorPanel}
          onPanelChange={setInspectorPanel}
          onSwitchingChange={updateSwitching}
          onNgfwChange={updateNgfw}
          onRouterChange={updateRouter}
          onNameChange={updateDeviceName}
          ipConflicts={duplicateIpConflicts.get(selected) || []}
          width={inspectorWidth}
          onWidthChange={setInspectorWidth}
          cancelToken={cancelToken}
        />}
        {selectedConnection && <ConnectionInspector connection={connections.find(item => item.id === selectedConnection)} validation={connectionValidations.get(selectedConnection)} width={inspectorWidth} onWidthChange={setInspectorWidth} onClose={() => setSelectedConnection(null)} cancelToken={cancelToken}/>} 
      </section>
    </main>
    {contextMenu?.type === 'connection' && (() => {
      const connection = connections.find(item => item.id === contextMenu.connectionId);
      return connection ? <div className="device-context-menu connection-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={event => event.stopPropagation()}>
        {connection.provisioning && <div className="isp-connection-details"><span>ISP-provided settings</span><dl><div><dt>Assigned IP</dt><dd>{connection.provisioning.address}/{connection.provisioning.prefix}</dd></div><div><dt>Subnet mask</dt><dd>{connection.provisioning.subnetMask}</dd></div><div><dt>Default gateway</dt><dd>{connection.provisioning.gateway}</dd></div></dl></div>}
        <label className="context-label-row"><span><strong>Connection label</strong><small>Shown directly on the link</small></span><input type="text" value={connection.label || ''} placeholder="Optional label" maxLength="40" onChange={event => setConnections(current => current.map(item => item.id === connection.id ? { ...item, label: event.target.value } : item))}/></label>
        <div className="context-color-row"><span><strong>Label accent</strong><small>Cable color now shows live status</small></span><input className="segment-color-input" type="color" value={connection.color || '#6e7d89'} onChange={event => setConnections(current => current.map(item => item.id === connection.id ? { ...item, color: event.target.value } : item))} aria-label="Choose connection label accent" /></div>
        <div className="segment-colors connection-colors" aria-label="Connection color presets">{['#5f79ff', '#16a3a6', '#50a66c', '#d68a28', '#df5a60', '#7c62c8'].map(color => <button key={color} aria-label={`Use ${color}`} className={(connection.color || '#6e7d89') === color ? 'active' : ''} style={{ background: color }} onClick={() => setConnections(current => current.map(item => item.id === connection.id ? { ...item, color } : item))}/>)}</div>
        <button className="context-danger" onClick={() => { removeConnectionById(connection.id); setSelectedConnection(null); setContextMenu(null); setToast('Connection deleted'); }}><Trash2 size={15}/><span><strong>Delete connection</strong><small>Keep both connected devices</small></span></button>
      </div> : null;
    })()}
    {contextMenu && contextMenu.type !== 'connection' && <div className="device-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={event => event.stopPropagation()}>
      <button onClick={() => { const deviceId = contextMenu.deviceId; setActiveTool('select'); setPendingPort(null); setPortPicker(null); setConnectPointer(null); setAreaSelection(null); setSegmentDrawing(null); setSelectedIds([]); setSelected(deviceId); setContextMenu(null); connectDevice(deviceId, true); }}><Cable size={15}/><span><strong>Connect</strong><small>Start a temporary link interaction</small></span></button>
      {contextMenu.managed && <button onClick={() => { setInspectorPanel('cli'); setSelected(contextMenu.deviceId); setContextMenu(null); }}><EthernetPort size={15}/><span><strong>Manage</strong><small>Open device command line</small></span></button>}
      {contextMenu.server && <button onClick={() => { setServerRoleDraft(contextMenu.serverRole); setServerPickerTarget(contextMenu.deviceId); setServerPickerOpen(true); setContextMenu(null); }}><Server size={15}/><span><strong>Change server role</strong><small>Choose DNS, DHCP, web, email, or file</small></span></button>}
    </div>}
    {serverPickerOpen && <div className="modal-backdrop" onPointerDown={() => setServerPickerOpen(false)}>
      <section className="server-picker" role="dialog" aria-modal="true" aria-labelledby="server-picker-title" onPointerDown={event => event.stopPropagation()}>
        <div className="server-picker-header"><div><span>Configure device</span><h2 id="server-picker-title">Choose a server role</h2><p>Select the primary service this server will provide.</p></div><button className="icon-button" onClick={() => setServerPickerOpen(false)}><X size={17}/></button></div>
        <div className="server-role-grid">{serverRoles.map(role => <button key={role.id} className={serverRoleDraft === role.id ? 'active' : ''} onClick={() => setServerRoleDraft(role.id)}>
          <span className="server-role-icon"><role.icon size={21}/></span>
          <span><strong>{role.name}</strong><small>{role.purpose}</small></span>
          <i>{serverRoleDraft === role.id ? '✓' : ''}</i>
        </button>)}</div>
        <div className="server-picker-note"><CircleHelp size={14}/><span>The selected role controls which services and settings appear in the device inspector. Protocols become active only when their simulator is implemented.</span></div>
        <div className="server-picker-actions"><button className="button secondary" onClick={() => { setServerPickerOpen(false); setServerPickerTarget(null); }}>Cancel</button><button className="button primary" onClick={placeConfiguredServer}>{serverPickerTarget ? <Save size={16}/> : <Plus size={16}/>} {serverPickerTarget ? 'Apply role' : 'Place server'}</button></div>
      </section>
    </div>}
    {toast && <div className="toast"><span>✓</span>{toast}</div>}
    {portPicker && (() => {
      const device = placed.find(item => item.instanceId === portPicker.deviceId);
      return <div className="modal-backdrop" onPointerDown={() => setPortPicker(null)}>
        <section className="port-picker" role="dialog" aria-modal="true" aria-labelledby="port-picker-title" onPointerDown={event => event.stopPropagation()}>
          <div className="server-picker-header"><div><span>Create connection</span><h2 id="port-picker-title">Choose a port on {device?.customName || device?.label || device?.name || 'device'}</h2><p>{portPicker.destination ? 'Select the destination interface for this link.' : 'Select the interface where this link should begin.'}</p></div><button className="icon-button" onClick={() => setPortPicker(null)} aria-label="Close port picker"><X size={17}/></button></div>
          <div className="port-picker-list">{portPicker.ports.map(port => {
            const switchPort = device?.switching?.ports?.[port.id];
            const vlanName = switchPort ? device.switching.vlans?.[switchPort.accessVlan] : null;
            return <button key={port.id} onClick={() => chooseConnectionPort(port.id)}>
              <span className={`port-symbol ${port.kind}`}><EthernetPort size={17}/></span>
              <span><strong>{port.label}</strong><small>{describePort(port)}</small></span>
              {switchPort ? <span className="port-picker-meta"><b>VLAN {switchPort.accessVlan}</b><small>{vlanName || 'Unnamed'}</small></span> : <span className="port-picker-meta"><b>{port.kind === 'routed' ? 'Routed' : 'Available'}</b><small>Free port</small></span>}
            </button>;
          })}</div>
          <div className="server-picker-actions"><button className="button secondary" onClick={() => setPortPicker(null)}>Cancel</button></div>
        </section>
      </div>;
    })()}
  </div>;
}

function CanvasNote({ note, selected, onSelect, onChange, onDelete }) {
  return <div className={`note-card ${selected ? 'selected' : ''}`} style={{ left: note.x, top: note.y }} onPointerDown={event => { event.stopPropagation(); onSelect(); }}>
    <div><span>Note</span><button onClick={onDelete} title="Delete note"><X size={12}/></button></div>
    <textarea autoFocus={!note.text} value={note.text} onChange={event => onChange(event.target.value)} placeholder="Type a note…" />
  </div>;
}

function NetworkSegment({ segment, selected, zoom, cancelToken, onSelect, onChange, onDelete }) {
  const interaction = useRef(null);

  useEffect(() => {
    if (!interaction.current) return;
    const start = interaction.current;
    onChange({ x: start.x, y: start.y, width: start.width, height: start.height });
    interaction.current = null;
  }, [cancelToken]);

  function startInteraction(event, mode) {
    event.stopPropagation();
    if (event.button !== 0) return;
    interaction.current = { mode, clientX: event.clientX, clientY: event.clientY, x: segment.x, y: segment.y, width: segment.width, height: segment.height };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function continueInteraction(event) {
    if (!interaction.current) return;
    const start = interaction.current;
    const dx = (event.clientX - start.clientX) / (zoom / 100);
    const dy = (event.clientY - start.clientY) / (zoom / 100);
    if (start.mode === 'move') onChange({ x: Math.max(0, start.x + dx), y: Math.max(0, start.y + dy) });
    else onChange({ width: Math.max(80, start.width + dx), height: Math.max(55, start.height + dy) });
  }

  return <div className={`network-segment movable ${selected ? 'selected' : ''}`} style={{ '--segment-color': segment.color, left: segment.x, top: segment.y, width: segment.width, height: segment.height }} onPointerDown={event => {
    onSelect();
    if (!event.target.closest('input, button, .segment-resize')) startInteraction(event, 'move');
    else event.stopPropagation();
  }} onPointerMove={continueInteraction} onPointerUp={() => { interaction.current = null; }}>
    <div className="segment-label">
      <input value={segment.label} onChange={event => onChange({ label: event.target.value })} aria-label="Edit segment label" />
      <input className="segment-color-input" type="color" value={segment.color} onChange={event => onChange({ color: event.target.value })} aria-label="Edit segment color" />
      <button onClick={onDelete} title="Delete segment"><X size={13}/></button>
    </div>
    <button className="segment-resize" aria-label="Resize segment" title="Drag to resize" onPointerDown={event => startInteraction(event, 'resize')}/>
  </div>;
}

function describePort(port) {
  if (port.kind === 'routed') return 'Independent routed interface';
  if (port.kind === 'wireless' || port.kind === 'endpoint-wireless') return 'Wireless · LAN bridge';
  if (port.kind === 'switched') return port.bridge === 'uplink' ? 'Ethernet handoff' : 'Switch port · LAN bridge';
  if (port.kind === 'external') return 'External network connection';
  if (port.kind === 'provider') return 'Service provider connection';
  if (port.kind === 'access') return 'Provider access connection';
  return 'Endpoint interface';
}

const connectionStatusLabels = { operational: 'Operational', partial: 'Partial', misconfigured: 'Misconfigured', down: 'Down', unevaluated: 'Not evaluated' };

function ConnectionInspector({ connection, validation, width, onWidthChange, onClose, cancelToken }) {
  const resize = useRef(null);
  useEffect(() => {
    if (!resize.current) return;
    onWidthChange(resize.current.width);
    resize.current = null;
  }, [cancelToken]);
  if (!connection || !validation) return null;

  function startResize(event) {
    event.preventDefault(); event.stopPropagation();
    resize.current = { x: event.clientX, width };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function continueResize(event) {
    if (!resize.current) return;
    const maximum = Math.max(320, Math.min(640, window.innerWidth - 120));
    onWidthChange(Math.max(260, Math.min(maximum, resize.current.width + resize.current.x - event.clientX)));
  }

  return <aside className="inspector connection-inspector" style={{ width }} onPointerDown={event => event.stopPropagation()}>
    <div className="inspector-resize-handle" role="separator" aria-label="Resize connection inspector" aria-orientation="vertical" tabIndex="0" onPointerDown={startResize} onPointerMove={continueResize} onPointerUp={() => { resize.current = null; }}/>
    <div className="inspector-scroll">
      <div className="inspector-header"><div><span>Connection inspector</span><div className="inspector-device-name"><strong>{connection.label || `${validation.type} connection`}</strong></div></div><button className="icon-button" onClick={onClose}><X size={16}/></button></div>
      <section className="connection-status-summary"><span className={`connection-status-badge ${validation.status}`}>{connectionStatusLabels[validation.status]}</span><div><strong>{validation.type}</strong><small>{validation.layers.physical.detail}</small></div></section>
      <section className="inspector-section"><h3>Connected ports</h3><div className="connection-endpoints">{validation.endpoints.map(endpoint => {
        const modeDetail = endpoint.mode === 'trunk' ? `trunk · 802.1Q · VLANs ${endpoint.trunkVlans.length ? endpoint.trunkVlans.join(', ') : 'none'}` : endpoint.mode === 'access' ? `access · VLAN ${endpoint.accessVlan}` : endpoint.mode;
        return <div key={`${endpoint.endpoint.deviceId}-${endpoint.endpoint.portId}`}><EthernetPort size={14}/><span><strong>{endpoint.device?.customName || endpoint.device?.name || 'Unknown device'}</strong><small>{endpoint.port?.label || endpoint.endpoint.portId}{modeDetail ? ` · ${modeDetail}` : ''}</small></span></div>;
      })}</div></section>
      <section className="inspector-section"><h3>Validation by layer</h3><div className="validation-layers">{Object.entries(validation.layers).map(([layer, state]) => <div key={layer}><i className={state.status}/><span><strong>{layer === 'layer2' ? 'Layer 2' : layer === 'layer3' ? 'Layer 3' : layer[0].toUpperCase() + layer.slice(1)}</strong><small>{state.detail}</small></span></div>)}</div></section>
      {validation.type === 'Trunk' && <section className="inspector-section"><h3>Trunk VLANs</h3><div className="trunk-vlan-detail"><div><span>Configured</span><strong>{validation.configuredVlans.length ? validation.configuredVlans.join(', ') : 'None'}</strong></div><div><span>Operational</span><strong>{validation.operationalVlans.length ? validation.operationalVlans.join(', ') : 'None'}</strong></div></div><div className="trunk-vlan-statuses">{validation.vlanStatuses.map(item => <span className={item.status} key={item.vlan}><i/>VLAN {item.vlan} · {item.status === 'operational' ? 'Operational' : 'Incomplete'}</span>)}</div></section>}
      {validation.endpoints.some(endpoint => endpoint.interfaceConfig?.address) && <section className="inspector-section"><h3>IP configuration</h3><div className="connection-ip-list">{validation.endpoints.filter(endpoint => endpoint.interfaceConfig?.address).map(endpoint => <div key={endpoint.endpoint.deviceId}><span>{endpoint.device?.customName || endpoint.device?.name}</span><strong>{endpoint.interfaceConfig.address}/{endpoint.interfaceConfig.prefix ?? 24}</strong></div>)}</div></section>}
      {!!validation.problems.length && <section className="inspector-section diagnostics"><h3>What needs attention</h3>{validation.problems.map((problem, index) => <div key={problem}><CircleHelp size={13}/><span><strong>{problem}</strong><small>{validation.corrections[index] || 'Review the connected interface configuration.'}</small></span></div>)}</section>}
      {!validation.problems.length && <section className="inspector-section diagnostics success"><h3>Connection ready</h3><div><ShieldCheck size={14}/><span><strong>No link-level problems detected</strong><small>Security policies and end-to-end routing are still evaluated separately.</small></span></div></section>}
    </div>
  </aside>;
}

function DeviceInspector({ item, onClose, onInterfaceChange, connectMode, pendingPort, connections, allDevices, ipConflicts, onConnectPort, panel, onPanelChange, onSwitchingChange, onNgfwChange, onRouterChange, onNameChange, width, onWidthChange, cancelToken }) {
  const resize = useRef(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(item?.customName || item?.name || '');
  useEffect(() => { setEditingName(false); setNameDraft(item?.customName || item?.name || ''); }, [item?.instanceId]);
  useEffect(() => {
    if (!resize.current) return;
    onWidthChange(resize.current.width);
    resize.current = null;
  }, [cancelToken]);
  if (!item) return null;
  const definition = getDeviceDefinition(item.id);
  const ports = definition?.ports || [];
  const bridgeIds = [...new Set(ports.map(port => port.bridge).filter(Boolean))];

  function startResize(event) {
    event.preventDefault(); event.stopPropagation();
    resize.current = { x: event.clientX, width };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function continueResize(event) {
    if (!resize.current) return;
    const maximum = Math.max(320, Math.min(640, window.innerWidth - 120));
    onWidthChange(Math.max(260, Math.min(maximum, resize.current.width + resize.current.x - event.clientX)));
  }

  function saveName() {
    onNameChange(item.instanceId, nameDraft);
    setEditingName(false);
  }

  return <aside className="inspector" style={{ width }} onPointerDown={event => event.stopPropagation()}>
    <div className="inspector-resize-handle" role="separator" aria-label="Resize device inspector" aria-orientation="vertical" tabIndex="0" onKeyDown={event => { if (event.key === 'ArrowLeft') onWidthChange(Math.min(640, width + 20)); else if (event.key === 'ArrowRight') onWidthChange(Math.max(260, width - 20)); }} onPointerDown={startResize} onPointerMove={continueResize} onPointerUp={() => { resize.current = null; }}/>
    <div className="inspector-scroll">
    <div className="inspector-header">
      <div><span>Device inspector</span><div className="inspector-device-name">{editingName ? <input autoFocus value={nameDraft} maxLength="48" aria-label="Custom device name" onChange={event => setNameDraft(event.target.value)} onBlur={saveName} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setNameDraft(item.customName || item.name); setEditingName(false); } }}/> : <><strong>{item.customName || item.name}</strong><button className="rename-device" title="Rename device" aria-label="Rename device" onClick={() => setEditingName(true)}><Pencil size={12}/></button></>}</div></div>
      <button className="icon-button" onClick={onClose}><X size={16}/></button>
    </div>
    {(item.id === 'switch-managed' || item.id === 'firewall-ngfw' || item.id === 'router-advanced') && <div className="inspector-tabs"><button className={panel === 'details' ? 'active' : ''} onClick={() => onPanelChange('details')}>Details</button><button className={panel === 'cli' ? 'active' : ''} onClick={() => onPanelChange('cli')}>Command line</button></div>}
    {!!ipConflicts.length && <div className="device-ip-conflict"><CircleHelp size={14}/><span><strong>Duplicate IP address detected</strong><small>{[...new Set(ipConflicts.map(conflict => conflict.address))].join(', ')} is already used by another device on this local network. Assign a unique address.</small></span></div>}
    {!definition ? <div className="inspector-empty">Detailed simulation is not available for this device yet.</div> : panel === 'cli' && item.id === 'switch-managed' ? <ManagedSwitchTerminal item={item} onSwitchingChange={onSwitchingChange}/> : panel === 'cli' && item.id === 'firewall-ngfw' ? <NgfwTerminal item={item} onNgfwChange={onNgfwChange}/> : panel === 'cli' && item.id === 'router-advanced' ? <RouterTerminal item={item} onRouterChange={onRouterChange}/> : <>
      <section className="inspector-section">
        <h3>Physical ports <span>{ports.length}</span></h3>
        <div className="port-list">{ports.map(port => {
          const isPending = pendingPort?.deviceId === item.instanceId && pendingPort?.portId === port.id;
          const link = connections.find(connection => [connection.a, connection.b].some(end => end.deviceId === item.instanceId && end.portId === port.id));
          const isConnected = Boolean(link);
          const peerEnd = link && (link.a.deviceId === item.instanceId && link.a.portId === port.id ? link.b : link.a);
          const peer = peerEnd && allDevices.find(device => device.instanceId === peerEnd.deviceId);
          const peerPort = peerEnd && getDeviceDefinition(peer?.id)?.ports.find(candidate => candidate.id === peerEnd.portId);
          const linkedTo = peer ? `Linked to ${peer.customName || peer.name}${peerPort ? ` · ${peerPort.label}` : ''}` : 'Linked';
          const switchPort = item.switching?.ports?.[port.id];
          const vlanName = switchPort ? item.switching.vlans?.[switchPort.accessVlan] : null;
          if (switchPort) return <div className={`managed-port-row ${isPending ? 'pending' : ''}`} key={port.id}>
            <div className="managed-port-identity"><div className={`port-symbol ${port.kind}`}><EthernetPort size={14}/></div><div><strong>{port.label}</strong><span>{switchPort.enabled ? (switchPort.description || 'Enabled access port') : 'Shutdown'}</span></div></div>
            <small className="vlan-badge" title={switchPort.mode === 'trunk' ? `802.1Q trunk carrying ${(switchPort.allowedVlans || []).join(', ') || 'all configured VLANs'}` : `VLAN ${switchPort.accessVlan}: ${vlanName || 'Unnamed'}`}><b>{switchPort.mode === 'trunk' ? '802.1Q trunk' : `VLAN ${switchPort.accessVlan}`}</b><em>{switchPort.mode === 'trunk' ? ((switchPort.allowedVlans || []).join(', ') || 'All VLANs') : (vlanName || 'Unnamed')}</em></small>
            {connectMode ? <button className="port-connect" disabled={isConnected || !switchPort.enabled} onClick={() => onConnectPort(item.instanceId, port.id)}>{isConnected ? 'Linked' : !switchPort.enabled ? 'Shutdown' : isPending ? 'Selected' : 'Connect'}</button> : <span className={`port-link-state ${isConnected ? 'linked' : switchPort.enabled ? 'available' : 'shutdown'}`}>{isConnected ? 'Linked' : switchPort.enabled ? 'Available' : 'Shutdown'}</span>}
          </div>;
          return <div className={`port-row ${isPending ? 'pending' : ''}`} key={port.id}>
            <div className={`port-symbol ${port.kind}`}><EthernetPort size={14}/></div>
            <div><strong>{port.label}</strong><span>{isConnected ? linkedTo : describePort(port)}</span></div>
            {connectMode ? <button className="port-connect" disabled={isConnected} onClick={() => onConnectPort(item.instanceId, port.id)}>{isConnected ? 'Linked' : isPending ? 'Selected' : 'Connect'}</button> : <span className={`port-link-state ${isConnected ? 'linked' : 'available'}`}>{isConnected ? 'Linked' : 'Available'}</span>}
          </div>;
        })}</div>
      </section>
      {(item.id === 'firewall-ngfw' || item.id === 'router-advanced') && <VlanSubinterfaceEditor item={item} ports={ports} onNgfwChange={onNgfwChange} onRouterChange={onRouterChange}/>} 
      {item.id === 'switch-managed' && <ManagedSwitchSummary item={item} ports={ports}/>} 
      <section className="inspector-section">
        <h3>IP interfaces</h3>
        {[...ports.filter(port => ['routed', 'endpoint', 'endpoint-wireless'].includes(port.kind)).map(port => ({ id: port.id, label: port.label })), ...bridgeIds.map(id => ({ id, label: `${id.toUpperCase()} bridge` }))].map(networkInterface => {
          const provisioned = item.ispProvisioning?.[networkInterface.id];
          const providerLocked = ['internet', 'isp-network'].includes(item.id);
          const locked = Boolean(provisioned || providerLocked);
          return <div className={`interface-config ${locked ? 'isp-locked' : ''}`} key={networkInterface.id}>
            <label>{networkInterface.label}{locked && <small>{providerLocked ? 'ISP gateway · fixed' : 'ISP provided'}</small>}</label>
            <div><input aria-label={`${networkInterface.label} IP address`} readOnly={locked} placeholder="IP address" value={item.interfaces?.[networkInterface.id]?.address || ''} onChange={event => onInterfaceChange(item.instanceId, networkInterface.id, 'address', event.target.value)}/><span>/</span><input aria-label={`${networkInterface.label} prefix`} readOnly={locked} type="number" min="0" max="32" value={item.interfaces?.[networkInterface.id]?.prefix ?? 24} onChange={event => onInterfaceChange(item.instanceId, networkInterface.id, 'prefix', event.target.value)}/></div>
            {provisioned && <p>Mask 255.255.255.252 · Default gateway {provisioned.gateway}</p>}
          </div>;
        })}
        {!ports.some(port => ['routed', 'endpoint', 'endpoint-wireless'].includes(port.kind)) && !bridgeIds.length && <p>No configurable IP interfaces.</p>}
      </section>
      <section className="inspector-section">
        <h3>Enabled capabilities</h3>
        <div className="inspector-capabilities">{featureLabels(item.capabilities || definition.capabilities).map(feature => <span key={feature}>✓ {feature}</span>)}</div>
      </section>
    </>}
    </div>
  </aside>;
}

function ManagedSwitchSummary({ item, ports }) {
  const switching = item.switching;
  if (!switching) return null;
  const isSaved = item.startupSwitching && JSON.stringify(item.startupSwitching) === JSON.stringify(switching);
  return <section className="inspector-section switch-summary">
    <h3>Switch configuration <span className={isSaved ? 'config-saved' : 'config-unsaved'}>{isSaved ? 'Saved' : 'Unsaved'}</span></h3>
    <div className="switch-identity"><span>Hostname</span><strong>{switching.hostname}</strong></div>
    <div className="vlan-summary-list">{Object.entries(switching.vlans).sort((a, b) => Number(a[0]) - Number(b[0])).map(([vlanId, vlanName]) => {
      const members = Object.entries(switching.ports).filter(([, config]) => String(config.accessVlan) === vlanId).map(([portId]) => ports.find(port => port.id === portId)?.label || portId);
      return <div className="vlan-summary" key={vlanId}>
        <span>VLAN {vlanId}</span>
        <div><strong>{vlanName}</strong><small>{members.length ? members.join(', ') : 'No access ports assigned'}</small></div>
      </div>;
    })}</div>
    <div className="vlan-summary-list">{Object.entries(switching.ports).filter(([, config]) => config.mode === 'trunk').map(([portId, config]) => <div className="vlan-summary" key={`trunk-${portId}`}><span>{ports.find(port => port.id === portId)?.label || portId}</span><div><strong>802.1Q trunk</strong><small>Allowed VLANs: {config.allowedVlans?.length ? config.allowedVlans.join(', ') : 'All configured VLANs'}</small></div></div>)}</div>
    <p className="switch-summary-hint">Changes shown here are active immediately. Use <code>write memory</code> in the command line to mark the running configuration as saved.</p>
  </section>;
}

function loadTerminalState(key, createSession, initialLines) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved && Array.isArray(saved.lines) && Array.isArray(saved.history)) return { session: saved.session || createSession(), command: saved.command || '', lines: saved.lines, history: saved.history };
  } catch { /* Use a clean terminal if saved scrollback is invalid. */ }
  return { session: createSession(), command: '', lines: initialLines, history: [] };
}

function saveTerminalState(key, session, command, lines, history) {
  try { localStorage.setItem(key, JSON.stringify({ session, command, lines: lines.slice(-500), history: history.slice(-100) })); }
  catch { /* Terminal persistence must not interrupt configuration. */ }
}

function ManagedSwitchTerminal({ item, onSwitchingChange }) {
  const initialLines = ['PacketTracker Managed Switch CLI', 'Type ? to list available commands.'];
  const storageKey = `packettracker-terminal-switch-${item.instanceId}`;
  const initialState = useRef(loadTerminalState(storageKey, createSwitchCliSession, initialLines)).current;
  const [session, setSession] = useState(initialState.session);
  const [command, setCommand] = useState(initialState.command);
  const [lines, setLines] = useState(initialState.lines);
  const commandHistory = useRef(initialState.history);
  const historyIndex = useRef(initialState.history.length);
  const outputRef = useRef(null);

  useEffect(() => {
    const saved = loadTerminalState(`packettracker-terminal-switch-${item.instanceId}`, createSwitchCliSession, initialLines);
    setSession(saved.session); setCommand(saved.command); setLines(saved.lines);
    commandHistory.current = saved.history; historyIndex.current = saved.history.length;
  }, [item.instanceId]);

  useEffect(() => saveTerminalState(storageKey, session, command, lines, commandHistory.current), [storageKey, session, command, lines]);

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [lines]);

  function runCommand(event) {
    event.preventDefault();
    const entered = command.trim();
    if (!entered) return;
    if (['clear', 'cls', 'clear screen'].includes(entered.toLowerCase())) {
      commandHistory.current.push(entered); historyIndex.current = commandHistory.current.length;
      setLines([]); setCommand(''); return;
    }
    const prompt = switchPrompt(session, item.switching);
    const result = executeSwitchCommand(session, item.switching, entered);
    setLines(current => [...current, `${prompt} ${entered}`, ...result.output]);
    setSession(result.session);
    onSwitchingChange(item.instanceId, result.switching, result.saved);
    commandHistory.current.push(entered);
    historyIndex.current = commandHistory.current.length;
    setCommand('');
  }

  function navigateHistory(event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') { event.preventDefault(); setLines([]); return; }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      historyIndex.current = Math.max(0, historyIndex.current - 1);
      setCommand(commandHistory.current[historyIndex.current] || '');
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      historyIndex.current = Math.min(commandHistory.current.length, historyIndex.current + 1);
      setCommand(commandHistory.current[historyIndex.current] || '');
    }
  }

  return <section className="switch-terminal-section">
    <div className="terminal-status"><span className="terminal-dot"/> Interactive configuration <small>{item.startupSwitching ? 'Saved configuration available' : 'Unsaved configuration'}</small></div>
    <div className="switch-terminal" ref={outputRef} aria-live="polite">{lines.map((line, index) => <div key={`${index}-${line}`}>{line || ' '}</div>)}</div>
    <form className="terminal-input" onSubmit={runCommand}>
      <label>{switchPrompt(session, item.switching)}</label>
      <input autoFocus value={command} onChange={event => setCommand(event.target.value)} onKeyDown={navigateHistory} autoComplete="off" spellCheck="false" aria-label="Switch command" />
    </form>
    <p className="terminal-help">Trunk: select a port, then use <code>switchport trunk encapsulation dot1q</code>, <code>switchport mode trunk</code>, and <code>switchport trunk allowed vlan 10,20</code>.</p>
  </section>;
}

function NgfwTerminal({ item, onNgfwChange }) {
  const initialLines = ['PacketTracker NGFW CLI', 'Start with: enable, configure terminal', 'For a trunk: interface inside.10, encapsulation dot1Q 10, then ip address 10.1.10.254/24', 'ASA-style "vlan 10" is also accepted. Type ? for available commands.'];
  const storageKey = `packettracker-terminal-ngfw-${item.instanceId}`;
  const initialState = useRef(loadTerminalState(storageKey, createNgfwCliSession, initialLines)).current;
  const [session, setSession] = useState(initialState.session);
  const [command, setCommand] = useState(initialState.command);
  const [lines, setLines] = useState(initialState.lines);
  const commandHistory = useRef(initialState.history);
  const historyIndex = useRef(initialState.history.length);
  const outputRef = useRef(null);

  useEffect(() => {
    const saved = loadTerminalState(`packettracker-terminal-ngfw-${item.instanceId}`, createNgfwCliSession, initialLines);
    setSession(saved.session); setCommand(saved.command); setLines(saved.lines);
    commandHistory.current = saved.history; historyIndex.current = saved.history.length;
  }, [item.instanceId]);
  useEffect(() => saveTerminalState(storageKey, session, command, lines, commandHistory.current), [storageKey, session, command, lines]);
  useEffect(() => { if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight; }, [lines]);

  function runCommand(event) {
    event.preventDefault();
    const entered = command.trim();
    if (!entered) return;
    if (['clear', 'cls', 'clear screen'].includes(entered.toLowerCase())) {
      commandHistory.current.push(entered); historyIndex.current = commandHistory.current.length;
      setLines([]); setCommand(''); return;
    }
    const prompt = ngfwPrompt(session, item.ngfw);
    const result = executeNgfwCommand(session, item.ngfw, item.interfaces, entered);
    setLines(current => [...current, `${prompt} ${entered}`, ...result.output]);
    setSession(result.session);
    onNgfwChange(item.instanceId, result.config, result.interfaces, result.saved);
    commandHistory.current.push(entered); historyIndex.current = commandHistory.current.length; setCommand('');
  }

  function navigateHistory(event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') { event.preventDefault(); setLines([]); return; }
    if (event.key === 'ArrowUp') { event.preventDefault(); historyIndex.current = Math.max(0, historyIndex.current - 1); setCommand(commandHistory.current[historyIndex.current] || ''); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); historyIndex.current = Math.min(commandHistory.current.length, historyIndex.current + 1); setCommand(commandHistory.current[historyIndex.current] || ''); }
  }

  return <section className="switch-terminal-section">
    <div className="terminal-status"><span className="terminal-dot"/> Interactive firewall configuration <small>{item.startupNgfw ? 'Saved configuration available' : 'Unsaved configuration'}</small></div>
    <div className="switch-terminal" ref={outputRef} aria-live="polite">{lines.map((line, index) => <div key={`${index}-${line}`}>{line || ' '}</div>)}</div>
    <form className="terminal-input" onSubmit={runCommand}>
      <label>{ngfwPrompt(session, item.ngfw)}</label>
      <input autoFocus value={command} onChange={event => setCommand(event.target.value)} onKeyDown={navigateHistory} autoComplete="off" spellCheck="false" aria-label="Firewall command" />
    </form>
    <p className="terminal-help">Trunk example: <code>interface inside.10</code>, <code>encapsulation dot1Q 10</code>, <code>ip address 10.1.10.254/24</code>. ASA-style <code>vlan 10</code> also works. Creation, encapsulation, and addressing are separate steps.</p>
  </section>;
}

function RouterTerminal({ item, onRouterChange }) {
  const initialLines = ['PacketTracker Advanced Router CLI', 'Type ? to list available commands.', '802.1Q example: interface gigabitEthernet 0/0.10'];
  const storageKey = `packettracker-terminal-router-${item.instanceId}`;
  const initialState = useRef(loadTerminalState(storageKey, createRouterCliSession, initialLines)).current;
  const [session, setSession] = useState(initialState.session);
  const [command, setCommand] = useState(initialState.command);
  const [lines, setLines] = useState(initialState.lines);
  const commandHistory = useRef(initialState.history);
  const historyIndex = useRef(initialState.history.length);
  const outputRef = useRef(null);
  useEffect(() => {
    const saved = loadTerminalState(`packettracker-terminal-router-${item.instanceId}`, createRouterCliSession, initialLines);
    setSession(saved.session); setCommand(saved.command); setLines(saved.lines);
    commandHistory.current = saved.history; historyIndex.current = saved.history.length;
  }, [item.instanceId]);
  useEffect(() => saveTerminalState(storageKey, session, command, lines, commandHistory.current), [storageKey, session, command, lines]);
  useEffect(() => { if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight; }, [lines]);
  function runCommand(event) {
    event.preventDefault();
    const entered = command.trim();
    if (!entered) return;
    if (['clear', 'cls', 'clear screen'].includes(entered.toLowerCase())) {
      commandHistory.current.push(entered); historyIndex.current = commandHistory.current.length; setLines([]); setCommand(''); return;
    }
    const prompt = routerPrompt(session, item.routerConfig);
    const result = executeRouterCommand(session, item.routerConfig, item.interfaces, entered);
    setLines(current => [...current, `${prompt} ${entered}`, ...result.output]);
    setSession(result.session); onRouterChange(item.instanceId, result.config, result.interfaces, result.saved);
    commandHistory.current.push(entered); historyIndex.current = commandHistory.current.length; setCommand('');
  }
  function navigateHistory(event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') { event.preventDefault(); setLines([]); return; }
    if (event.key === 'ArrowUp') { event.preventDefault(); historyIndex.current = Math.max(0, historyIndex.current - 1); setCommand(commandHistory.current[historyIndex.current] || ''); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); historyIndex.current = Math.min(commandHistory.current.length, historyIndex.current + 1); setCommand(commandHistory.current[historyIndex.current] || ''); }
  }
  return <section className="switch-terminal-section">
    <div className="terminal-status"><span className="terminal-dot"/> Interactive router configuration <small>{item.startupRouterConfig ? 'Saved configuration available' : 'Unsaved configuration'}</small></div>
    <div className="switch-terminal" ref={outputRef} aria-live="polite">{lines.map((line, index) => <div key={`${index}-${line}`}>{line || ' '}</div>)}</div>
    <form className="terminal-input" onSubmit={runCommand}><label>{routerPrompt(session, item.routerConfig)}</label><input autoFocus value={command} onChange={event => setCommand(event.target.value)} onKeyDown={navigateHistory} autoComplete="off" spellCheck="false" aria-label="Router command"/></form>
    <p className="terminal-help">Create <code>interface gigabitEthernet 0/0.10</code>, then explicitly set <code>encapsulation dot1Q 10</code> and <code>ip address 10.1.10.254 255.255.255.0</code>.</p>
  </section>;
}

function VlanSubinterfaceEditor({ item, ports, onNgfwChange, onRouterChange }) {
  const isNgfw = item.id === 'firewall-ngfw';
  const config = isNgfw ? item.ngfw : item.routerConfig;
  const update = (nextConfig, nextInterfaces) => isNgfw ? onNgfwChange(item.instanceId, nextConfig, nextInterfaces) : onRouterChange(item.instanceId, nextConfig, nextInterfaces);
  function addSubinterface() {
    const next = structuredClone(config), parent = ports[0].id;
    let unit = 10;
    while (next.subinterfaces[`${parent}.${unit}`]) unit += 10;
    next.subinterfaces[`${parent}.${unit}`] = { parent, unit, vlanId: null, enabled: true, ...(isNgfw ? { zone: 'LAN' } : {}) };
    update(next, structuredClone(item.interfaces || {}));
  }
  function changeSubinterface(id, field, value) {
    const next = structuredClone(config), interfaces = structuredClone(item.interfaces || {}), sub = next.subinterfaces[id];
    if (field === 'parent') {
      const previousParent = sub.parent, vlanId = sub.vlanId;
      const nextId = `${value}.${sub.unit}`;
      if (nextId !== id && next.subinterfaces[nextId]) return;
      sub.parent = value;
      if (nextId !== id) { next.subinterfaces[nextId] = sub; delete next.subinterfaces[id]; if (interfaces[id]) { interfaces[nextId] = interfaces[id]; delete interfaces[id]; } }
      if (vlanId != null) {
        if (!Object.values(next.subinterfaces).some(other => other !== sub && other.parent === previousParent && other.vlanId === vlanId)) next.ports[previousParent].allowedVlans = next.ports[previousParent].allowedVlans.filter(vlan => vlan !== vlanId);
        next.ports[value].mode = 'trunk';
        if (!next.ports[value].allowedVlans.includes(vlanId)) next.ports[value].allowedVlans.push(vlanId);
      }
    }
    else if (field === 'vlanId') {
      const previous = sub.vlanId, numeric = value === '' ? null : Number(value);
      if (numeric != null && (!Number.isInteger(numeric) || numeric < 1 || numeric > 4094)) return;
      sub.vlanId = numeric;
      if (previous != null && !Object.values(next.subinterfaces).some(other => other !== sub && other.parent === sub.parent && other.vlanId === previous)) next.ports[sub.parent].allowedVlans = next.ports[sub.parent].allowedVlans.filter(vlan => vlan !== previous);
      if (numeric >= 1 && numeric <= 4094 && !Object.values(next.subinterfaces).some(other => other !== sub && other.parent === sub.parent && other.vlanId === numeric)) {
        next.ports[sub.parent].mode = 'trunk';
        if (!next.ports[sub.parent].allowedVlans.includes(numeric)) next.ports[sub.parent].allowedVlans.push(numeric);
      }
    } else if (field === 'address') interfaces[id] = { address: value, prefix: interfaces[id]?.prefix ?? 24 };
    else if (field === 'prefix') interfaces[id] = { address: interfaces[id]?.address || '', prefix: Number(value) };
    else sub[field] = value;
    update(next, interfaces);
  }
  function removeSubinterface(id) {
    const next = structuredClone(config), interfaces = structuredClone(item.interfaces || {}), removed = next.subinterfaces[id];
    delete next.subinterfaces[id]; delete interfaces[id];
    if (removed?.vlanId != null && !Object.values(next.subinterfaces).some(sub => sub.parent === removed.parent && sub.vlanId === removed.vlanId)) next.ports[removed.parent].allowedVlans = next.ports[removed.parent].allowedVlans.filter(vlan => vlan !== removed.vlanId);
    update(next, interfaces);
  }
  const entries = Object.entries(config?.subinterfaces || {});
  return <section className="inspector-section subinterface-editor">
    <h3>VLAN subinterfaces <button type="button" onClick={addSubinterface}>Add subinterface</button></h3>
    <p className="subinterface-intro">Create the subinterface, explicitly assign its {isNgfw ? 'VLAN' : '802.1Q encapsulation'}, then configure its gateway address.</p>
    {!entries.length && <p>No VLAN subinterfaces configured.</p>}
    {entries.map(([id, sub]) => {
      const duplicate = sub.vlanId != null && entries.some(([otherId, other]) => otherId !== id && other.parent === sub.parent && other.vlanId === sub.vlanId);
      return <div className={`subinterface-card ${sub.vlanId == null || duplicate ? 'incomplete' : ''}`} key={id}>
        <div className="subinterface-title"><strong>{id}</strong><button type="button" aria-label={`Remove ${id}`} title="Remove subinterface" onClick={() => removeSubinterface(id)}><X size={13}/></button></div>
        <label>Physical interface<select value={sub.parent} onChange={event => changeSubinterface(id, 'parent', event.target.value)}>{ports.map(port => <option value={port.id} key={port.id}>{port.label}</option>)}</select></label>
        <label>{isNgfw ? '802.1Q encapsulation / VLAN ID' : '802.1Q VLAN ID'}<input type="number" min="1" max="4094" placeholder="Required" value={sub.vlanId ?? ''} onChange={event => changeSubinterface(id, 'vlanId', event.target.value)}/></label>
        <label>Gateway address<div className="subinterface-address"><input placeholder="IP address" value={item.interfaces?.[id]?.address || ''} onChange={event => changeSubinterface(id, 'address', event.target.value)}/><span>/</span><input type="number" min="0" max="32" value={item.interfaces?.[id]?.prefix ?? 24} onChange={event => changeSubinterface(id, 'prefix', event.target.value)}/></div></label>
        {isNgfw && <label>Security zone<input value={sub.zone || ''} onChange={event => changeSubinterface(id, 'zone', event.target.value)}/></label>}
        {sub.vlanId == null && <small className="subinterface-warning">Encapsulation is required before tagged traffic can use this subinterface.</small>}
        {duplicate && <small className="subinterface-warning">VLAN {sub.vlanId} is already assigned on this physical interface.</small>}
      </div>;
    })}
  </section>;
}

function PlacedDevice({ item, selected, ipConflicts, interactionMode, cancelToken, onConnect, onContextMenu, onSelect, onMove, onDelete }) {
  const Icon = item.icon;
  const [dragging, setDragging] = useState(false);
  const offset = useRef({ x: 0, y: 0 });
  const dragOrigin = useRef(null);

  useEffect(() => {
    if (!dragging || !dragOrigin.current) return;
    onMove(item.instanceId, dragOrigin.current.x, dragOrigin.current.y);
    setDragging(false);
    dragOrigin.current = null;
  }, [cancelToken]);

  function pointerDown(event) {
    event.stopPropagation();
    if (event.button !== 0) return;
    if (interactionMode === 'connect') {
      onConnect(item.instanceId);
      return;
    }
    onSelect(item.instanceId);
    setDragging(true);
    dragOrigin.current = { x: item.x, y: item.y };
    offset.current = { x: event.clientX - item.x, y: event.clientY - item.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  return <div className={`placed-device ${selected ? 'selected' : ''} ${dragging ? 'dragging' : ''} ${ipConflicts.length ? 'configuration-error' : ''}`} style={{ left: item.x, top: item.y, '--device-color': item.color }}
    onContextMenu={onContextMenu}
    onPointerDown={pointerDown}
    onPointerMove={e => { if (dragging) onMove(item.instanceId, Math.max(8, e.clientX - offset.current.x), Math.max(8, e.clientY - offset.current.y)); }}
    onPointerUp={() => { setDragging(false); dragOrigin.current = null; }}>
    {selected && <button className="delete-device" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onDelete(); }}><Trash2 size={13}/></button>}
    {!!ipConflicts.length && <><span className="device-error-badge" title="Duplicate IP address"><TriangleAlert size={13}/></span><span className="device-error-label">IP conflict: {[...new Set(ipConflicts.map(conflict => conflict.address))].join(', ')}</span></>}
    <div className="placed-icon"><Icon size={29}/><span className="port-light"/></div>
    <button className="placed-help" aria-label={`About ${item.customName || item.name}`} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
      <CircleHelp size={13}/>
      <span className="placed-tooltip" role="tooltip">
        <strong>{item.customName || item.name}</strong>
        {!!ipConflicts.length && <em className="tooltip-error">Duplicate IP: {[...new Set(ipConflicts.map(conflict => conflict.address))].join(', ')}</em>}
        <p>{item.purpose || item.model || 'A general-purpose network device.'}</p>
        <small>{item.ports || 'Port details coming soon'}</small>
        {!!item.capabilities?.length && <span>{featureLabels(item.capabilities).join(' · ')}</span>}
      </span>
    </button>
  </div>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
