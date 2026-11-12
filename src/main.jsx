import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AppWindow, Box, Cable, ChevronDown, ChevronRight, CircleHelp, Cloud, Cpu,
  Copy, Database, Download, Ellipsis, EthernetPort, FilePlus2, Gauge, Grid3X3,
  FolderOpen, Globe2, HardDrive, Headphones, HousePlug, Laptop, LockKeyhole, Mail, Menu, Minus, Monitor,
  Moon, MousePointer2, Network, PanelLeftClose, PanelLeftOpen, Phone, Plus, Printer,
  Pencil, RadioTower, Redo2, RotateCcw, Router, Save, Scan, Search, Server, ShieldCheck,
  Smartphone, Sparkles, SquareDashedMousePointer, Sun, Trash2, TriangleAlert, Undo2,
  GraduationCap, LogOut, Send, Share2, Users, Video, Wifi, X, ZoomIn, ZoomOut
} from 'lucide-react';
import './styles.css';
import { getDeviceDefinition } from './simulation/definitions.js';
import { createSwitchCliSession, executeSwitchCommand, switchPrompt } from './simulation/managedSwitchCli.js';
import { createNgfwCliSession, executeNgfwCommand, ngfwPrompt } from './simulation/ngfwCli.js';
import { createRouterCliSession, executeRouterCommand, routerPrompt } from './simulation/routerCli.js';
import { createFirewallCliSession, executeFirewallCommand, firewallPrompt } from './simulation/firewallPolicyCli.js';
import { findDuplicateIpConflicts, validateConnections } from './simulation/connectionValidation.js';
import { devicePrimaryAddress, runPing } from './simulation/ping.js';
import { evaluateAssignment } from './assignments/evaluate.js';

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

const isWirelessPort = port => ['wireless', 'endpoint-wireless'].includes(port?.kind);
const isSharedWirelessRadio = port => port?.kind === 'wireless';
const CANVAS_WIDTH = 6400;
const CANVAS_HEIGHT = 4400;
const CANVAS_ORIGIN_X = 1800;
const CANVAS_ORIGIN_Y = 1200;
const GRID_SIZE = 20;
const MIN_ZOOM = 20;

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
  { id: 'ap', name: 'Access Point', category: 'wireless', icon: Wifi, color: '#7c62c8', ports: '1 Ethernet uplink · Wi-Fi', purpose: 'Bridges wireless clients onto a wired local network.', capabilities: ['switching', 'wifi'] },
  { id: 'wireless-router', name: 'Wireless Gateway', category: 'wireless', icon: RadioTower, color: '#7c62c8', ports: '4 LAN · 1 WAN · Wi-Fi', purpose: 'Connects wireless devices to a small wired network.', capabilities: ['switching', 'wifi', 'dhcp', 'nat'] },
  { id: 'cell-tower', name: 'Cell Tower', category: 'wireless', icon: RadioTower, color: '#7c62c8', model: 'Cell Tower' },
  { id: 'firewall-stateless', name: 'Stateless Firewall', category: 'security', icon: ShieldCheck, color: '#df5a60', ports: '2 routed interfaces', purpose: 'Checks each packet against ordered IP, port, and protocol rules.', capabilities: ['ip', 'routing', 'statelessFirewall', 'acl', 'cli'] },
  { id: 'firewall-stateful', name: 'Stateful Firewall', category: 'security', icon: ShieldCheck, color: '#df5a60', ports: '2 routed interfaces', purpose: 'Tracks connections so legitimate return traffic can pass.', capabilities: ['ip', 'routing', 'statelessFirewall', 'statefulFirewall', 'acl', 'cli'] },
  { id: 'firewall-ngfw', name: 'Next-Generation Firewall', category: 'security', icon: ShieldCheck, color: '#df5a60', ports: '4 routed interfaces', purpose: 'Identifies applications and inspects traffic for threats.', capabilities: ['ip', 'routing', 'acl', 'statefulFirewall', 'appAwareness', 'ips', 'deepInspection', 'cli'] },
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
  { id: 'ip-phone', name: 'IP Phone', category: 'end', icon: Phone, color: '#647182', ports: '1 Ethernet interface', purpose: 'A network telephone that can participate in IP reachability assignments.', capabilities: ['ip'] },
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

function configuredServerForRole(role) {
  return {
    ...devices.find(device => device.id === 'server'),
    name: role.name,
    label: role.name,
    icon: role.icon,
    purpose: role.purpose,
    capabilities: role.capabilities,
    serverRole: role.id,
    services: role.capabilities.filter(capability => capability.endsWith('Service'))
  };
}

const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
const displayScale = () => Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--display-scale')) || 1;
function assignmentDescription(value, sentenceLimit = 3) {
  const description = String(value || '').trim();
  if (!description) return 'Network design assignment';
  const sentences = description.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [description];
  const limited = sentences.slice(0, sentenceLimit).join(' ').replace(/\s+/g, ' ').trim();
  return `${limited}${sentences.length > sentenceLimit ? '…' : ''}`;
}

function assignmentPointBreakdown(spec, evaluation) {
  const requiredByRole = new Map((spec?.roles || []).map(role => [role.id, role.count]));
  const devices = {
    total: (spec?.roles || []).reduce((sum, role) => sum + role.count, 0),
    passed: (evaluation?.roleStatus || []).reduce((sum, role) => sum + Math.min(role.required, role.compatible), 0)
  };
  const relationshipPoints = action => (evaluation?.requirements || []).filter(item => item.type === 'relationship' && item.action === action).reduce((result, item) => {
    const expected = (requiredByRole.get(item.from) || 0) * (requiredByRole.get(item.to) || 0);
    result.total += Math.max(expected, item.checks?.length || 0);
    result.passed += item.checks?.filter(check => check.status === 'passed').length || 0;
    return result;
  }, { passed: 0, total: 0 });
  const segmentation = (evaluation?.requirements || []).filter(item => item.type === 'constraint').reduce((result, item) => {
    let expected = 0;
    for (let left = 0; left < item.roles.length; left++) for (let right = left + 1; right < item.roles.length; right++) expected += (requiredByRole.get(item.roles[left]) || 0) * (requiredByRole.get(item.roles[right]) || 0);
    result.total += Math.max(expected, item.checks?.length || 0);
    result.passed += item.checks?.filter(check => check.status === 'passed').length || 0;
    return result;
  }, { passed: 0, total: 0 });
  const configuration = (evaluation?.requirements || []).filter(item => item.type === 'configuration').reduce((result, item) => {
    result.total += item.checks?.length || 1;
    result.passed += item.checks?.filter(check => check.status === 'passed').length || 0;
    return result;
  }, { passed: 0, total: 0 });
  const connect = relationshipPoints('allow'), block = relationshipPoints('deny');
  return { devices, connect, block, segmentation, configuration, all: { passed: devices.passed + connect.passed + block.passed + segmentation.passed + configuration.passed, total: devices.total + connect.total + block.total + segmentation.total + configuration.total } };
}

const ASSIGNMENT_AI_PROMPT = `You are helping a teacher create a PacketTracker network architecture assignment. Interview the teacher one question at a time, then return one JSON object and no markdown around it.

Begin by asking:
1. What is the general description of this situation?
2. How many different endpoint roles are there, what are they called, and how many devices are required in each role?
3. Which roles must communicate with which other roles? Ask separately about each direction.
4. Which roles must be blocked from initiating communication with other roles?
5. Must any roles be separated into different Layer 2 broadcast domains or VLANs?
6. Are there any other architecture requirements relevant to IP or MAC/Layer 2 reachability?

Ask follow-up questions whenever an answer is ambiguous. Explain these PacketTracker limits before accepting requirements:
- Supported assessed endpoint device types are only "pc", "laptop", "server", and "ip-phone".
- A role represents endpoint devices, not routers, switches, firewalls, VLANs, departments without devices, or Internet services.
- Supported checks are Layer 2 domain reachability and Layer 3 ICMP reachability.
- Layer 3 protocol must be "icmp". HTTP, HTTPS, DNS, email, files, applications, ports, dynamic routing, VPN behavior, IPS, and content inspection cannot currently be graded.
- A directional allow or deny rule must be explicit. A→B does not imply B→A.
- The only supported constraint is "separate_l2_domains".
- Do not invent device types, services, constraint types, or fields outside this contract.

Required JSON shape:
{
  "schemaVersion": "0.1",
  "scenario": { "id": "lowercase-stable-id", "title": "Title", "description": "Student-facing instructions", "objectives": ["Optional objective"] },
  "roles": [ { "id": "role-id", "name": "Display name", "deviceTypes": ["pc"], "count": 1 } ],
  "relationships": [ { "id": "unique-check-id", "from": "source-role-id", "to": "destination-role-id", "action": "allow", "layer": "l3", "protocol": "icmp" } ],
  "constraints": [ { "id": "unique-constraint-id", "type": "separate_l2_domains", "roles": ["role-a", "role-b"] } ],
  "settings": { "allowExtraDevices": true, "showLiveProgress": true, "showFailureReasons": true }
}

For Layer 2 relationships use "layer": "l2" and omit protocol. Counts must be integers of at least 1. All referenced role IDs must exist. Do not add services or internet sections. Before producing JSON, summarize the proposed roles and directional checks and ask the teacher to confirm. Then output valid JSON only.`;

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

function loadSavedDesign(source) {
  try {
    const saved = source || JSON.parse(localStorage.getItem('packettracker-design') || '[]');
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
        firewall: item.firewall || structuredClone(definition?.defaults?.firewall || { mode: 'none', policies: [] }),
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

function projectDraftKey(projectId) {
  return `packettracker-project-draft-${projectId}`;
}

function loadProjectDraft(projectId) {
  if (!projectId) return null;
  try {
    const draft = JSON.parse(localStorage.getItem(projectDraftKey(projectId)) || 'null');
    return draft && Array.isArray(draft.devices) ? draft : null;
  } catch { return null; }
}

function editorViewKey(projectId) {
  return `packettracker-editor-view-${projectId || 'local'}`;
}

function loadEditorView(projectId) {
  try { return JSON.parse(localStorage.getItem(editorViewKey(projectId)) || 'null') || {}; }
  catch { return {}; }
}

function EditorApp({ project, user, onSave, onBack, readOnly = false, activity = null, onActivitySave, onActivityComplete, onActivityReset }) {
  const draft = useRef(readOnly || activity ? null : loadProjectDraft(project?.id)).current;
  const savedEditorView = useRef(loadEditorView(project?.id)).current;
  const [activeCategory, setActiveCategory] = useState(savedEditorView.activeCategory || 'routers');
  const [query, setQuery] = useState('');
  const [placed, setPlaced] = useState(() => loadSavedDesign(draft?.devices ?? project?.document?.devices));
  const [selected, setSelected] = useState(null);
  const [zoom, setZoom] = useState(() => Math.max(MIN_ZOOM, Math.min(150, Number(savedEditorView.zoom) || 100)));
  const [gridLock, setGridLock] = useState(savedEditorView.gridLock === true);
  const [sidebarOpen, setSidebarOpen] = useState(savedEditorView.sidebarOpen !== false);
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
  const [inspectorPanel, setInspectorPanel] = useState(savedEditorView.inspectorPanel || 'details');
  const [contextMenu, setContextMenu] = useState(null);
  const [pingDialog, setPingDialog] = useState(null);
  const [cliDeviceId, setCliDeviceId] = useState(null);
  const [cancelToken, setCancelToken] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [assignmentPanelOpen, setAssignmentPanelOpen] = useState(false);
  const [assignmentPanelCategory, setAssignmentPanelCategory] = useState('overview');
  const [activityHelpOpen, setActivityHelpOpen] = useState(() => activity ? savedEditorView.activityHelpOpen !== false : false);
  const [activityPanelTab, setActivityPanelTab] = useState(() => ['instructions', 'challenge'].includes(savedEditorView.activityPanelTab) ? savedEditorView.activityPanelTab : 'instructions');
  const [activityPanelWidth, setActivityPanelWidth] = useState(() => Math.max(300, Math.min(650, Number(localStorage.getItem('packettracker-activity-panel-width')) || 390)));
  const [activityResult, setActivityResult] = useState(null);
  const [activityBusy, setActivityBusy] = useState(false);
  const [activitySaveState, setActivitySaveState] = useState('saved');
  const [connections, setConnections] = useState(() => {
    if (draft?.connections) return structuredClone(draft.connections);
    if (project?.document?.connections) return structuredClone(project.document.connections);
    try { const saved = JSON.parse(localStorage.getItem('packettracker-connections') || '[]'); return Array.isArray(saved) ? saved : []; }
    catch { return []; }
  });
  const [notes, setNotes] = useState(() => {
    if (draft?.notes) return structuredClone(draft.notes);
    if (project?.document?.notes) return structuredClone(project.document.notes);
    try { const saved = JSON.parse(localStorage.getItem('packettracker-notes') || '[]'); return Array.isArray(saved) ? saved : []; }
    catch { return []; }
  });
  const [segments, setSegments] = useState(() => {
    if (draft?.segments) return structuredClone(draft.segments);
    if (project?.document?.segments) return structuredClone(project.document.segments);
    try { const saved = JSON.parse(localStorage.getItem('packettracker-segments') || '[]'); return Array.isArray(saved) ? saved : []; }
    catch { return []; }
  });
  const canvasRef = useRef(null);
  const canvasInitializedRef = useRef(false);
  const viewSaveFrameRef = useRef(null);
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
  const activitySaveRef = useRef(onActivitySave);
  useEffect(() => { activitySaveRef.current = onActivitySave; }, [onActivitySave]);

  useEffect(() => {
    if (canvasInitializedRef.current || !canvasRef.current) return;
    canvasInitializedRef.current = true;
    const canvas = canvasRef.current;
    const scale = zoom / 100;
    canvas.scrollLeft = Number.isFinite(savedEditorView.scrollLeft) ? savedEditorView.scrollLeft : Math.max(0, CANVAS_ORIGIN_X * scale - 100);
    canvas.scrollTop = Number.isFinite(savedEditorView.scrollTop) ? savedEditorView.scrollTop : Math.max(0, CANVAS_ORIGIN_Y * scale - 80);
  }, [zoom]);

  const filtered = useMemo(() => devices.filter(device =>
    (query ? `${device.name} ${device.model || ''} ${device.purpose || ''} ${featureLabels(device.capabilities).join(' ')}`.toLowerCase().includes(query.toLowerCase()) : device.category === activeCategory)
  ), [query, activeCategory]);
  const connectionValidations = useMemo(() => validateConnections(placed, connections), [placed, connections]);
  const duplicateIpConflicts = useMemo(() => findDuplicateIpConflicts(placed, connections), [placed, connections]);
  const assignmentSpec = project?.assignment?.specification || null;
  const assignmentEvaluation = useMemo(() => assignmentSpec ? evaluateAssignment(assignmentSpec, placed, connections) : null, [assignmentSpec, placed, connections]);
  const assignmentPoints = assignmentEvaluation ? assignmentPointBreakdown(assignmentSpec, assignmentEvaluation) : null;
  const assignmentTotal = assignmentPoints?.all.total || 0;
  const assignmentPassed = assignmentPoints?.all.passed || 0;
  const assignmentProgress = assignmentTotal > 0 && assignmentPassed === assignmentTotal ? 'complete' : assignmentPassed > 0 ? 'partial' : 'empty';
  const assignmentPercent = assignmentTotal ? Math.round((assignmentPassed / assignmentTotal) * 100) : 0;
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

  function persistEditorScroll(event) {
    const { scrollLeft, scrollTop } = event.currentTarget;
    if (viewSaveFrameRef.current) cancelAnimationFrame(viewSaveFrameRef.current);
    viewSaveFrameRef.current = requestAnimationFrame(() => {
      const previous = loadEditorView(project?.id);
      localStorage.setItem(editorViewKey(project?.id), JSON.stringify({ ...previous, scrollLeft, scrollTop, zoom, gridLock, sidebarOpen, activeCategory, inspectorPanel }));
      viewSaveFrameRef.current = null;
    });
  }

  useEffect(() => localStorage.setItem('packettracker-design', JSON.stringify(serializeDesign(placed))), [placed]);
  useEffect(() => localStorage.setItem('packettracker-connections', JSON.stringify(connections)), [connections]);
  useEffect(() => localStorage.setItem('packettracker-notes', JSON.stringify(notes)), [notes]);
  useEffect(() => localStorage.setItem('packettracker-segments', JSON.stringify(segments)), [segments]);
  useEffect(() => {
    const previous = loadEditorView(project?.id);
    const canvas = canvasRef.current;
    localStorage.setItem(editorViewKey(project?.id), JSON.stringify({ ...previous, zoom, gridLock, sidebarOpen, activeCategory, inspectorPanel, activityHelpOpen, activityPanelTab, ...(canvas ? { scrollLeft: canvas.scrollLeft, scrollTop: canvas.scrollTop } : {}) }));
  }, [project?.id, zoom, gridLock, sidebarOpen, activeCategory, inspectorPanel, activityHelpOpen, activityPanelTab]);
  useEffect(() => () => { if (viewSaveFrameRef.current) cancelAnimationFrame(viewSaveFrameRef.current); }, []);
  useEffect(() => {
    if (readOnly || !project?.id) return;
    localStorage.setItem(projectDraftKey(project.id), JSON.stringify({ version: 2, updatedAt: Date.now(), devices: serializeDesign(placed), connections, notes, segments }));
  }, [placed, connections, notes, segments, project?.id, readOnly]);

  useEffect(() => {
    if (!activity || readOnly || !activitySaveRef.current) return undefined;
    setActivitySaveState('saving');
    const timer = setTimeout(() => {
      activitySaveRef.current({ version: 2, devices: serializeDesign(placed), connections, notes, segments })
        .then(() => setActivitySaveState('saved'))
        .catch(() => setActivitySaveState('error'));
    }, 650);
    return () => clearTimeout(timer);
  }, [activity?.attempt?.id, placed, connections, notes, segments, readOnly]);
  useEffect(() => localStorage.setItem('packettracker-inspector-width', String(inspectorWidth)), [inspectorWidth]);
  useEffect(() => localStorage.setItem('packettracker-activity-panel-width', String(activityPanelWidth)), [activityPanelWidth]);
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
    const closeOutside = event => {
      if (!event.target.closest?.('.device-context-menu')) setContextMenu(null);
    };
    const closeOnEscape = event => {
      if (event.key === 'Escape') setContextMenu(null);
    };
    document.addEventListener('pointerdown', closeOutside, true);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('blur', close);
    return () => {
      document.removeEventListener('pointerdown', closeOutside, true);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('blur', close);
    };
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
      const highlightedText = window.getSelection()?.toString();
      if ((event.ctrlKey || event.metaKey) && key === 'c' && highlightedText) return;
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
    setPingDialog(null);
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

  const snapCoordinate = value => gridLock ? Math.round(value / GRID_SIZE) * GRID_SIZE : value;

  function autoZoomCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const content = [
      ...placed.map(item => ({ left: item.x, top: item.y, right: item.x + 53, bottom: item.y + 58 })),
      ...segments.map(segment => ({ left: segment.x, top: segment.y, right: segment.x + segment.width, bottom: segment.y + segment.height })),
      ...notes.map(note => ({ left: note.x, top: note.y, right: note.x + 176, bottom: note.y + 108 }))
    ];
    if (!content.length) {
      setZoom(100);
      requestAnimationFrame(() => { canvas.scrollLeft = Math.max(0, CANVAS_ORIGIN_X - 80); canvas.scrollTop = Math.max(0, CANVAS_ORIGIN_Y - 80); });
      return;
    }
    const bounds = content.reduce((result, item) => ({
      left: Math.min(result.left, item.left), top: Math.min(result.top, item.top),
      right: Math.max(result.right, item.right), bottom: Math.max(result.bottom, item.bottom)
    }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
    const inspectorOpen = Boolean(selected || selectedConnection);
    const rightOcclusion = (activity && activityHelpOpen ? activityPanelWidth : 0) + (inspectorOpen ? inspectorWidth + 24 : 0);
    const viewportWidth = Math.max(240, canvas.clientWidth - rightOcclusion);
    const viewportHeight = Math.max(180, canvas.clientHeight);
    const padding = 56;
    const contentWidth = Math.max(80, bounds.right - bounds.left);
    const contentHeight = Math.max(70, bounds.bottom - bounds.top);
    const fitted = Math.floor(Math.min((viewportWidth - padding * 2) / contentWidth, (viewportHeight - padding * 2) / contentHeight) * 100);
    const nextZoom = Math.max(MIN_ZOOM, Math.min(150, fitted));
    setZoom(nextZoom);
    requestAnimationFrame(() => {
      const scale = nextZoom / 100;
      const centerX = (bounds.left + bounds.right) / 2;
      const centerY = (bounds.top + bounds.bottom) / 2;
      canvas.scrollLeft = Math.max(0, (CANVAS_ORIGIN_X + centerX) * scale - viewportWidth / 2);
      canvas.scrollTop = Math.max(0, (CANVAS_ORIGIN_Y + centerY) * scale - viewportHeight / 2);
    });
  }

  function addDevice(device, point) {
    const canvas = canvasRef.current;
    const bounds = canvas?.getBoundingClientRect();
    const uiScale = displayScale();
    const x = point ? ((point.clientX - bounds.left) / uiScale + canvas.scrollLeft) / (zoom / 100) - CANVAS_ORIGIN_X : 160 + (placed.length % 5) * 115;
    const y = point ? ((point.clientY - bounds.top) / uiScale + canvas.scrollTop) / (zoom / 100) - CANVAS_ORIGIN_Y : 130 + Math.floor(placed.length / 5) * 105;
    const definition = getDeviceDefinition(device.id);
    const item = {
      ...device,
      instanceId: uid(),
      x: snapCoordinate(Math.max(30, x - 27)),
      y: snapCoordinate(Math.max(30, y - 23)),
      label: device.name,
      interfaces: structuredClone(definition?.defaults?.interfaces || {}),
      gateway: null,
      firewall: structuredClone(definition?.defaults?.firewall || { mode: 'none', policies: [] }),
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
    event.dataTransfer.setData('deviceId', device.id);
    if (device.serverRole) event.dataTransfer.setData('serverRole', device.serverRole);
  }

  function placeConfiguredServer() {
    const role = serverRoles.find(item => item.id === serverRoleDraft) || serverRoles[0];
    const configured = configuredServerForRole(role);
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
    const snappedX = snapCoordinate(x), snappedY = snapCoordinate(y);
    setPlaced(current => {
      const anchor = current.find(item => item.instanceId === instanceId);
      if (!anchor) return current;
      if (selectedIds.length > 1 && selectedIds.includes(instanceId)) {
        const dx = snappedX - anchor.x, dy = snappedY - anchor.y;
        const selectedSet = new Set(selectedIds);
        return current.map(item => selectedSet.has(item.instanceId) ? { ...item, x: Math.max(8, item.x + dx), y: Math.max(8, item.y + dy) } : item);
      }
      return current.map(item => item.instanceId === instanceId ? { ...item, x: snappedX, y: snappedY } : item);
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

  function updateGateway(instanceId, value) {
    setPlaced(current => current.map(item => item.instanceId === instanceId ? { ...item, gateway: value.trim() || null } : item));
  }

  function updateSwitching(instanceId, switching, saved = false) {
    setPlaced(current => current.map(item => item.instanceId === instanceId ? { ...item, switching, ...(saved ? { startupSwitching: structuredClone(switching) } : {}) } : item));
  }

  function updateNgfw(instanceId, ngfw, interfaces, saved = false) {
    setPlaced(current => current.map(item => item.instanceId === instanceId ? { ...item, ngfw, interfaces, ...(saved ? { startupNgfw: structuredClone(ngfw), startupInterfaces: structuredClone(interfaces) } : {}) } : item));
  }

  function updateFirewall(instanceId, firewall, saved = false) {
    setPlaced(current => current.map(item => item.instanceId === instanceId ? { ...item, firewall, ...(saved ? { startupFirewall: structuredClone(firewall) } : {}) } : item));
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
    const selectedPort = getDeviceDefinition(selectedDevice?.id)?.ports.find(port => port.id === portId);
    if (selectedDevice?.switching?.ports?.[portId]?.enabled === false) return setToast('That switch port is shutdown. Use "no shutdown" before connecting it');
    const inUse = connections.some(connection => [connection.a, connection.b].some(end => end.deviceId === deviceId && end.portId === portId));
    if (inUse && !isSharedWirelessRadio(selectedPort)) return setToast('That port is already connected');
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
    const firstWireless = isWirelessPort(firstPort);
    const secondWireless = isWirelessPort(secondPort);
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
    const device = placed.find(item => item.instanceId === deviceId);
    const port = getDeviceDefinition(device?.id)?.ports.find(candidate => candidate.id === portId);
    const inUse = connections.some(connection => [connection.a, connection.b].some(end => end.deviceId === deviceId && end.portId === portId));
    const enabled = device?.switching?.ports?.[portId]?.enabled !== false;
    if ((inUse && !isSharedWirelessRadio(port)) || !enabled) return;
    setPortPicker(null);
    if (startFresh) {
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
    const sourceWireless = sourcePort && isWirelessPort(sourcePort);
    const compatiblePorts = definition.ports.filter(port => {
      const wireless = isWirelessPort(port);
      return !sourcePort || wireless === sourceWireless;
    });
    const availablePorts = compatiblePorts.filter(port => {
      const inUse = connections.some(connection => [connection.a, connection.b].some(end => end.deviceId === deviceId && end.portId === port.id));
      const enabled = device.switching?.ports?.[port.id]?.enabled !== false;
      return (!inUse || isSharedWirelessRadio(port)) && enabled;
    });
    if (!availablePorts.length) return setToast(sourcePort ? 'No compatible enabled port is available on that device' : 'That device has no enabled free ports');
    setSelected(deviceId);
    setInspectorPanel('details');
    const requiresExplicitPort = availablePorts.length > 1;
    if (requiresExplicitPort) {
      setPortPicker({ deviceId, ports: compatiblePorts, startFresh, destination: Boolean(activePendingPort) });
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
    const uiScale = displayScale();
    return {
      x: ((event.clientX - bounds.left) / uiScale + canvas.scrollLeft) / (zoom / 100) - CANVAS_ORIGIN_X,
      y: ((event.clientY - bounds.top) / uiScale + canvas.scrollTop) / (zoom / 100) - CANVAS_ORIGIN_Y
    };
  }

  function handleCanvasWheel(event) {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas || !event.deltaY) return;
    const nextZoom = Math.max(MIN_ZOOM, Math.min(150, zoom + (event.deltaY < 0 ? 10 : -10)));
    if (nextZoom === zoom) return;
    const bounds = canvas.getBoundingClientRect();
    const uiScale = displayScale();
    const pointerX = (event.clientX - bounds.left) / uiScale;
    const pointerY = (event.clientY - bounds.top) / uiScale;
    const worldX = (canvas.scrollLeft + pointerX) / (zoom / 100);
    const worldY = (canvas.scrollTop + pointerY) / (zoom / 100);
    setZoom(nextZoom);
    requestAnimationFrame(() => {
      canvas.scrollLeft = Math.max(0, worldX * (nextZoom / 100) - pointerX);
      canvas.scrollTop = Math.max(0, worldY * (nextZoom / 100) - pointerY);
    });
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
      const note = { id: uid(), x: snapCoordinate(point.x), y: snapCoordinate(point.y), text: '' };
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
      const uiScale = displayScale();
      canvas.scrollLeft = panRef.current.scrollLeft - (event.clientX - panRef.current.clientX) / uiScale;
      canvas.scrollTop = panRef.current.scrollTop - (event.clientY - panRef.current.clientY) / uiScale;
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
        setSegments(current => [...current, { id: uid(), x: snapCoordinate(x), y: snapCoordinate(y), width: snapCoordinate(width), height: snapCoordinate(height), label: segmentDraft.label.trim() || 'Network segment', color: segmentDraft.color }]);
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

  async function saveDesign() {
    localStorage.setItem('packettracker-design', JSON.stringify(serializeDesign(placed)));
    if (onSave) {
      try {
        await onSave({ version: 2, devices: serializeDesign(placed), connections, notes, segments });
        if (project?.id) localStorage.removeItem(projectDraftKey(project.id));
        setToast('Project saved to your profile');
      } catch (error) { setToast(error.message || 'Could not save project'); }
    } else setToast('Design saved locally');
  }

  async function completeActivity() {
    if (!onActivityComplete || activityBusy) return;
    setActivityBusy(true); setActivityResult(null);
    try {
      const result = await onActivityComplete({ version: 2, devices: serializeDesign(placed), connections, notes, segments });
      setActivityResult(result);
      if (result.evaluation?.completed) localStorage.removeItem(projectDraftKey(project.id));
    } catch (error) { setToast(error.message || 'Could not check the activity'); }
    finally { setActivityBusy(false); }
  }

  async function saveActivityProgress() {
    if (!onActivitySave || activitySaveState === 'saving') return;
    setActivitySaveState('saving');
    try {
      await onActivitySave({ version: 2, devices: serializeDesign(placed), connections, notes, segments });
      setActivitySaveState('saved'); setToast('Activity progress saved');
    } catch (error) { setActivitySaveState('error'); setToast(error.message || 'Could not save the activity'); }
  }

  async function resetActivity() {
    if (!onActivityReset || activityBusy || !window.confirm('Reset this activity? Your current activity work will be discarded and replaced with a fresh starting network.')) return;
    setActivityBusy(true);
    try { await onActivityReset(); }
    catch (error) { setToast(error.message || 'Could not reset the activity'); setActivityBusy(false); }
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
      <div className="brand editor-brand"><img className="editor-brand-logo" src="/packettracker-logo-with-text.png" alt="PacketTracker"/></div>
      <div className="project-header-nav"><span className="file-name">{project?.name || 'Untitled Network'}</span><button className="back-to-projects" onClick={onBack}>{activity ? 'Back to skills' : 'Back to projects'}</button></div>
      <div className="top-actions">
        {activity && <><span className={`activity-save-state ${activitySaveState}`}>{activitySaveState === 'saving' ? 'Saving…' : activitySaveState === 'error' ? 'Save failed' : 'Progress saved'}</span><button className="button secondary" disabled={activityBusy} onClick={resetActivity}><RotateCcw size={16}/> Reset activity</button><button className={`button secondary ${activityHelpOpen ? 'active' : ''}`} onClick={() => setActivityHelpOpen(true)}><CircleHelp size={16}/> Info</button><button className="button primary" disabled={activitySaveState === 'saving'} onClick={saveActivityProgress}><Save size={16}/>{activitySaveState === 'saving' ? 'Saving…' : 'Save'}</button></>}
        {assignmentSpec && (activity ? <div className={`assignment-summary-button assignment-summary-indicator ${assignmentProgress}`} style={{ '--challenge-progress': `${assignmentPercent}%` }} aria-label={`Challenge progress: ${assignmentPassed} of ${assignmentTotal} complete`}><FilePlus2 size={17}/><span>Challenge progress</span><small>{assignmentPassed} of {assignmentTotal} complete</small></div> : <button className={`assignment-summary-button ${assignmentProgress}`} disabled={activityBusy} style={{ '--challenge-progress': `${assignmentPercent}%` }} onClick={() => setAssignmentPanelOpen(true)}><FilePlus2 size={17}/><span>Show challenge</span><small>{assignmentPassed} of {assignmentTotal} complete</small></button>)}
        <button className="icon-button" title="Undo (Ctrl+Z)" disabled={!historyRef.current.past.length && !pendingHistoryRef.current} onClick={undoDesign}><Undo2 size={17}/></button>
        <button className="icon-button" title="Redo (Ctrl+Y)" disabled={!historyRef.current.future.length} onClick={redoDesign}><Redo2 size={17}/></button>
        <div className="divider" />
        <button className="button secondary" onClick={exportDesign}><Download size={16}/> Export</button>
        {!activity && <button className="button primary" disabled={readOnly} title={readOnly ? 'Shared projects are read-only' : 'Save project'} onClick={saveDesign}><Save size={16}/> {readOnly ? 'Read only' : 'Save project'}</button>}
        <div className="profile-wrap">
          <button className="avatar" onClick={() => setProfileOpen(value => !value)} aria-expanded={profileOpen} aria-label="Open profile settings">{user?.name?.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'PT'}</button>
          {profileOpen && <div className="profile-menu">
            <div className="profile-summary"><span>{user?.name?.[0]?.toUpperCase() || 'P'}</span><div><strong>{user?.name || 'Profile settings'}</strong><small>{user?.role || 'Local preferences'}</small></div></div>
            <button className="theme-toggle" onClick={() => setTheme(current => current === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <Moon size={16}/> : <Sun size={16}/>}<span><strong>Dark mode</strong><small>{theme === 'dark' ? 'On' : 'Off'}</small></span><i className={theme === 'dark' ? 'on' : ''}><b/></i>
            </button>
          </div>}
        </div>
      </div>
    </header>

    <main className={`workspace ${activity && activityHelpOpen ? 'activity-panel-open' : ''}`} style={{ '--activity-panel-width': `${activityPanelWidth}px` }}>
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
              {filtered.map(device => device.id === 'server' ? <div key={device.id} className="device-card server-device-card">
                <div className="server-card-overview">
                  <div className="device-icon" style={{ '--device-color': device.color }}><device.icon size={25}/></div>
                  <div className="device-summary"><span>{device.name}</span><p>Choose the service this host provides.</p><small>1 Ethernet interface</small></div>
                </div>
                <div className="server-type-palette">
                  <strong>Drag and Drop server type</strong>
                  <div>{serverRoles.map(role => <button key={role.id} draggable aria-label={`Add ${role.name}`} title={role.purpose} onDragStart={event => { event.stopPropagation(); handleDeviceDragStart(event, configuredServerForRole(role)); }} onClick={() => addDevice(configuredServerForRole(role))}>
                    <role.icon size={15}/><span>{role.name.replace(' Server', '')}</span>
                  </button>)}</div>
                </div>
              </div> : <button key={device.id} className="device-card" aria-label={`Add ${device.name}`} draggable onDragStart={event => handleDeviceDragStart(event, device)} onClick={() => chooseDevice(device)}>
                <div className="device-icon" style={{ '--device-color': device.color }}><device.icon size={25}/></div>
                <div className="device-summary">
                  <span>{device.name}</span>
                  <p>{device.purpose || device.model || 'A general-purpose network device.'}</p>
                  <small>{device.ports || 'Port details coming soon'}</small>
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
        {activity && activityHelpOpen && <ActivityInstructionsPanel activity={activity} tab={activityPanelTab} onTabChange={setActivityPanelTab} width={activityPanelWidth} onWidthChange={setActivityPanelWidth} specification={assignmentSpec} evaluation={assignmentEvaluation} points={assignmentPoints} onUseHint={async hintId => { await onActivitySave?.({ version: 2, devices: serializeDesign(placed), connections, notes, segments }, { hintIds: [hintId] }); }} onClose={() => setActivityHelpOpen(false)}/>}
        {activityResult && <ActivityResultModal result={activityResult} level={activity.attempt.requestedLevel} onClose={() => setActivityResult(null)} onBack={onBack}/>}
        {assignmentSpec && assignmentPanelOpen && <AssignmentChallengeModal spec={assignmentSpec} evaluation={assignmentEvaluation} devices={placed} activeCategory={assignmentPanelCategory} onCategoryChange={setAssignmentPanelCategory} onClose={() => setAssignmentPanelOpen(false)}/>}
        <div className="canvas-toolbar">
          <button className={`tool ${activeTool === 'select' ? 'active' : ''}`} onClick={() => setTool('select')}><MousePointer2 size={17}/><span>Select</span></button>
          <button className={`tool ${activeTool === 'connect' ? 'active' : ''}`} onClick={() => setTool('connect')}><Cable size={17}/><span>Connect</span></button>
          <button className={`tool ${activeTool === 'area' ? 'active' : ''}`} onClick={() => setTool('area')}><SquareDashedMousePointer size={17}/><span>Area</span></button>
          <button className={`tool ${activeTool === 'segment' ? 'active' : ''}`} onClick={() => setTool('segment')}><Box size={17}/><span>Add segment</span></button>
          <div className="divider" />
          <button className={`tool ${activeTool === 'note' ? 'active' : ''}`} onClick={() => setTool('note')}><FilePlus2 size={17}/><span>Note</span></button>
          <button className={`tool ${gridLock ? 'active' : ''}`} title="Snap newly placed and moved items to the background grid" aria-pressed={gridLock} onClick={() => setGridLock(value => !value)}><Grid3X3 size={17}/><span>Grid lock</span></button>
          <div className="divider" />
          <button className="tool zoom-tool" title="Zoom out" aria-label="Zoom out" disabled={zoom <= MIN_ZOOM} onClick={() => setZoom(value => Math.max(MIN_ZOOM, value - 10))}><ZoomOut size={17}/></button>
          <span className="toolbar-zoom-value" aria-label={`Current zoom ${zoom}%`}>{zoom}%</span>
          <button className="tool zoom-tool" title="Zoom in" aria-label="Zoom in" disabled={zoom >= 150} onClick={() => setZoom(value => Math.min(150, value + 10))}><ZoomIn size={17}/></button>
          <button className="tool auto-zoom-tool" title="Fit the network design in the visible workspace" onClick={autoZoomCanvas}><Scan size={17}/><span>Auto zoom</span></button>
        </div>
        {!!duplicateAlerts.length && <div className="topology-alert" role="alert"><TriangleAlert size={17}/><div><strong>Duplicate IP address detected</strong><span>{duplicateAlerts.map(alert => `${alert.address} — ${alert.names.join(' and ')}`).join(' · ')}</span></div></div>}
        {(activeTool !== 'select' || (pingDialog && !pingDialog.targetId)) && <div className="mode-hint">
          {activeTool === 'connect' && (pendingPort ? 'Now click the destination device to create the link' : 'Click the first device, then click the device you want to link')}
          {activeTool === 'area' && 'Drag across the canvas to select multiple devices'}
          {activeTool === 'note' && 'Click anywhere on the canvas to place a note'}
          {activeTool === 'segment' && 'Choose a label and color, then drag a box on the canvas'}
          {pingDialog && !pingDialog.targetId && 'Ping: click another device on the workspace to test reachability · Esc to cancel'}
        </div>}
        {activeTool === 'segment' && <div className="segment-controls" onPointerDown={event => event.stopPropagation()}>
          <input aria-label="Segment label" value={segmentDraft.label} onChange={event => setSegmentDraft(current => ({ ...current, label: event.target.value }))} placeholder="Segment label" />
          <div className="segment-colors" aria-label="Segment color">{['#5f79ff', '#16a3a6', '#50a66c', '#d68a28', '#df5a60', '#7c62c8'].map(color => <button key={color} aria-label={`Use ${color}`} className={segmentDraft.color === color ? 'active' : ''} style={{ background: color }} onClick={() => setSegmentDraft(current => ({ ...current, color }))}/>)}</div>
        </div>}
        <div ref={canvasRef} className={`canvas tool-${pingDialog && !pingDialog.targetId ? 'ping' : connectionActive ? 'connect' : activeTool} ${isPanning ? 'panning' : ''}`} onScroll={persistEditorScroll} onWheel={handleCanvasWheel} onContextMenu={handleCanvasContextMenu} onDragOver={e => e.preventDefault()} onDrop={e => {
          e.preventDefault();
          const device = devices.find(d => d.id === e.dataTransfer.getData('deviceId'));
          const serverRole = serverRoles.find(role => role.id === e.dataTransfer.getData('serverRole'));
          if (device) addDevice(serverRole ? configuredServerForRole(serverRole) : device, e);
        }} onPointerDown={handleCanvasPointerDown} onPointerMove={handleCanvasPointerMove} onPointerUp={handleCanvasPointerUp} onPointerCancel={handleCanvasPointerUp}>
          <div className="canvas-content" style={{ width: CANVAS_WIDTH * (zoom / 100), height: CANVAS_HEIGHT * (zoom / 100) }}>
          <div className="canvas-world" style={{ left: CANVAS_ORIGIN_X * (zoom / 100), top: CANVAS_ORIGIN_Y * (zoom / 100), transform: `scale(${zoom / 100})` }}>
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
                const aPort = getDeviceDefinition(a?.id)?.ports.find(port => port.id === connection.a.portId);
                const bPort = getDeviceDefinition(b?.id)?.ports.find(port => port.id === connection.b.portId);
                const wireless = [aPort, bPort].some(port => ['wireless', 'endpoint-wireless'].includes(port?.kind));
                return a && b ? <g key={connection.id} className={`${selectedConnection === connection.id ? 'selected' : ''} status-${validation?.status || 'unevaluated'} ${validation?.type === 'Trunk' ? 'trunk' : ''} ${wireless ? 'wireless-link' : ''}`} style={{ '--connection-label-color': connection.color || '#6e7d89' }}>
                  {validation?.type === 'Trunk' && validation.vlanStatuses?.length ? validation.vlanStatuses.map((vlanState, index) => {
                    const line = parallelConnectionLine(a, b, index, validation.vlanStatuses.length);
                    return <g className={`trunk-strand ${vlanState.status}`} key={vlanState.vlan}>
                      <line className="connection-status-outline" x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}/>
                      <line className="connection-line" x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}/>
                      <text className="vlan-strand-label" x={line.midX} y={line.midY - 4} textAnchor="middle">VLAN {vlanState.vlan}</text>
                    </g>;
                  }) : <><line className="connection-status-outline" x1={a.x + 27} y1={a.y + 23} x2={b.x + 27} y2={b.y + 23}/><line className="connection-line" x1={a.x + 27} y1={a.y + 23} x2={b.x + 27} y2={b.y + 23}/></>}
                  {wireless && <g className="wireless-connection-marker" transform={`translate(${(a.x + b.x) / 2 + 27} ${(a.y + b.y) / 2 + 23})`}><circle r="13"/><path d="M -7 -2 Q 0 -9 7 -2"/><path d="M -4 2 Q 0 -2 4 2"/><circle className="wireless-dot" cy="6" r="1.6"/></g>}
                  {connection.label && <text className="connection-label" x={(a.x + b.x) / 2 + 27} y={(a.y + b.y) / 2 + (wireless ? 3 : 18)} textAnchor="middle">{connection.label}</text>}
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
            {placed.map(item => <PlacedDevice key={item.instanceId} item={item} ipConflicts={duplicateIpConflicts.get(item.instanceId) || []} selected={selected === item.instanceId || selectedIds.includes(item.instanceId)} pingSource={pingDialog && !pingDialog.targetId && pingDialog.sourceId === item.instanceId} interactionMode={pingDialog && !pingDialog.targetId ? 'ping' : connectionActive ? 'connect' : activeTool} zoom={zoom} cancelToken={cancelToken} onPingTarget={instanceId => {
              if (instanceId === pingDialog.sourceId) return setToast('Choose a different device to ping');
              setPingDialog(current => ({ ...current, targetId: instanceId }));
            }} onConnect={connectDevice} onContextMenu={event => {
              event.preventDefault(); event.stopPropagation();
              setSelected(item.instanceId); setSelectedIds([]); setSelectedArtifact(null); setSelectedConnection(null);
              setContextMenu({ x: event.clientX, y: event.clientY, deviceId: item.instanceId, managed: ['switch-managed', 'firewall-stateless', 'firewall-stateful', 'firewall-ngfw', 'router-advanced'].includes(item.id), server: item.id === 'server', serverRole: item.serverRole || 'generic' });
            }} onSelect={instanceId => { setSelected(instanceId); if (!selectedIds.includes(instanceId)) setSelectedIds([]); setSelectedArtifact(null); setSelectedConnection(null); setInspectorPanel('details'); }} onMove={moveDevice} onDelete={() => { setPlaced(current => current.filter(d => d.instanceId !== item.instanceId)); setConnections(current => current.filter(connection => connection.a.deviceId !== item.instanceId && connection.b.deviceId !== item.instanceId)); setSelected(null); setSelectedConnection(null); }} />)}
          </div>
          </div>
        </div>
        <div className="statusbar">
          <div><span className="status-dot"/> Logical workspace <span className="separator">•</span> {placed.length} {placed.length === 1 ? 'device' : 'devices'}{selectedIds.length > 0 && ` · ${selectedIds.length} selected`}</div>
          <div className="zoom-control"><button onClick={() => setZoom(z => Math.max(MIN_ZOOM, z - 10))}><ZoomOut size={16}/></button><input type="range" min={MIN_ZOOM} max="150" value={zoom} onChange={e => setZoom(Number(e.target.value))}/><span>{zoom}%</span><button onClick={() => setZoom(z => Math.min(150, z + 10))}><ZoomIn size={16}/></button><button onClick={() => setZoom(100)}><RotateCcw size={14}/></button></div>
        </div>
        {selected && <DeviceInspector
          item={placed.find(item => item.instanceId === selected)}
          onClose={() => setSelected(null)}
          onInterfaceChange={updateInterface}
          onGatewayChange={updateGateway}
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
        <div className="context-color-row"><span><strong>Connection color</strong><small>Main link color; health appears on the outer edge</small></span><input className="segment-color-input" type="color" value={connection.color || '#6e7d89'} onChange={event => setConnections(current => current.map(item => item.id === connection.id ? { ...item, color: event.target.value } : item))} aria-label="Choose connection color" /></div>
        <div className="segment-colors connection-colors" aria-label="Connection color presets">{['#5f79ff', '#16a3a6', '#50a66c', '#d68a28', '#df5a60', '#7c62c8'].map(color => <button key={color} aria-label={`Use ${color}`} className={(connection.color || '#6e7d89') === color ? 'active' : ''} style={{ background: color }} onClick={() => setConnections(current => current.map(item => item.id === connection.id ? { ...item, color } : item))}/>)}</div>
        <button className="context-danger" onClick={() => { removeConnectionById(connection.id); setSelectedConnection(null); setContextMenu(null); setToast('Connection deleted'); }}><Trash2 size={15}/><span><strong>Delete connection</strong><small>Keep both connected devices</small></span></button>
      </div> : null;
    })()}
    {contextMenu && contextMenu.type !== 'connection' && <div className="device-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={event => event.stopPropagation()}>
      <button onClick={() => { const sourceId = contextMenu.deviceId; setPingDialog({ sourceId, targetId: null }); setSelected(null); setSelectedIds([]); setSelectedArtifact(null); setSelectedConnection(null); setContextMenu(null); }}><Send size={15}/><span><strong>Ping</strong><small>Test reachability to another device</small></span></button>
      <button onClick={() => { const deviceId = contextMenu.deviceId; setActiveTool('select'); setPendingPort(null); setPortPicker(null); setConnectPointer(null); setAreaSelection(null); setSegmentDrawing(null); setSelectedIds([]); setSelected(deviceId); setContextMenu(null); connectDevice(deviceId, true); }}><Cable size={15}/><span><strong>Connect</strong><small>Start a temporary link interaction</small></span></button>
      {contextMenu.managed && <button onClick={() => { setCliDeviceId(contextMenu.deviceId); setSelected(null); setContextMenu(null); }}><EthernetPort size={15}/><span><strong>Manage</strong><small>Open device command line</small></span></button>}
      {contextMenu.server && <button onClick={() => { setServerRoleDraft(contextMenu.serverRole); setServerPickerTarget(contextMenu.deviceId); setServerPickerOpen(true); setContextMenu(null); }}><Server size={15}/><span><strong>Change server role</strong><small>Choose DNS, DHCP, web, email, or file</small></span></button>}
      {assignmentSpec && (() => {
        const device = placed.find(item => item.instanceId === contextMenu.deviceId);
        const compatibleRoles = assignmentSpec.roles.filter(role => role.deviceTypes.includes(device?.id));
        if (!compatibleRoles.length) return null;
        if (!contextMenu.roleMenu) return <button onClick={() => setContextMenu(current => ({ ...current, roleMenu: true }))}><Users size={15}/><span><strong>Assign role</strong><small>{device.assignmentRoleName || 'Choose an assignment role'}</small></span><ChevronRight size={14}/></button>;
        return <div className="context-role-menu"><span>Assignment role</span>{compatibleRoles.map(role => <button key={role.id} className={device.assignmentRoleId === role.id ? 'active' : ''} onClick={() => { setPlaced(current => current.map(item => item.instanceId === device.instanceId ? { ...item, assignmentRoleId: role.id, assignmentRoleName: role.name } : item)); setContextMenu(null); }}><strong>{role.name}</strong><small>{placed.filter(item => item.assignmentRoleId === role.id).length}/{role.count} assigned</small></button>)}{device.assignmentRoleId && <button className="remove-role" onClick={() => { setPlaced(current => current.map(item => item.instanceId === device.instanceId ? { ...item, assignmentRoleId: null, assignmentRoleName: null } : item)); setContextMenu(null); }}>Remove role</button>}</div>;
      })()}
    </div>}
    {pingDialog?.targetId && <PingDialog sourceId={pingDialog.sourceId} targetId={pingDialog.targetId} devices={placed} connections={connections} onClose={() => setPingDialog(null)}/>}
    {cliDeviceId && <CliDialog item={placed.find(item => item.instanceId === cliDeviceId)} sidePanelOpen={activityHelpOpen} sidePanelWidth={activityPanelWidth} onSwitchingChange={updateSwitching} onNgfwChange={updateNgfw} onFirewallChange={updateFirewall} onRouterChange={updateRouter} onDone={() => setCliDeviceId(null)}/>}
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
            const portLinks = connections.filter(connection => [connection.a, connection.b].some(end => end.deviceId === device?.instanceId && end.portId === port.id));
            const link = portLinks[0];
            const peerEnd = link && (link.a.deviceId === device.instanceId && link.a.portId === port.id ? link.b : link.a);
            const peer = peerEnd && placed.find(item => item.instanceId === peerEnd.deviceId);
            const peerPort = peerEnd && getDeviceDefinition(peer?.id)?.ports.find(candidate => candidate.id === peerEnd.portId);
            const shutdown = switchPort?.enabled === false;
            const sharedRadio = isSharedWirelessRadio(port);
            const unavailable = Boolean((link && !sharedRadio) || shutdown);
            return <button key={port.id} disabled={unavailable} onClick={() => chooseConnectionPort(port.id)}>
              <span className={`port-symbol ${port.kind}`}>{isWirelessPort(port) ? <Wifi size={17}/> : <EthernetPort size={17}/>}</span>
              <span><strong>{port.label}</strong><small>{sharedRadio && link ? `${portLinks.length} wireless ${portLinks.length === 1 ? 'client' : 'clients'} associated` : link ? `Connected to ${peer?.customName || peer?.name || 'unknown device'}${peerPort ? ` · ${peerPort.label}` : ''}` : shutdown ? 'Administratively shutdown' : describePort(port)}</small></span>
              {sharedRadio ? <span className="port-picker-meta"><b>Wi-Fi radio</b><small>{link ? 'Available for another client' : 'Available'}</small></span> : link ? <span className="port-picker-meta occupied"><b>In use</b><small>{peer?.customName || peer?.name || 'Connected'}</small></span> : shutdown ? <span className="port-picker-meta shutdown"><b>Shutdown</b><small>Enable this port first</small></span> : switchPort ? <span className="port-picker-meta"><b>VLAN {switchPort.accessVlan}</b><small>{vlanName || 'Unnamed'}</small></span> : <span className="port-picker-meta"><b>{port.kind === 'routed' ? 'Routed' : 'Available'}</b><small>Free port</small></span>}
            </button>;
          })}</div>
          <div className="server-picker-actions"><button className="button secondary" onClick={() => setPortPicker(null)}>Cancel</button></div>
        </section>
      </div>;
    })()}
  </div>;
}

function AssignmentChallengeModal({ spec, evaluation, devices, activeCategory, onCategoryChange, onClose }) {
  const [expandedRequirements, setExpandedRequirements] = useState(() => new Set());
  const relationships = evaluation.requirements.filter(item => item.type === 'relationship');
  const allowedRelationships = relationships.filter(item => item.action === 'allow');
  const blockedRelationships = relationships.filter(item => item.action === 'deny');
  const constraints = evaluation.requirements.filter(item => item.type === 'constraint');
  const configuration = evaluation.requirements.filter(item => item.type === 'configuration');
  const roleNames = new Map(spec.roles.map(role => [role.id, role.name]));
  const deviceNames = new Map(devices.map(device => [device.instanceId, device.customName || device.name]));
  const devicesById = new Map(devices.map(device => [device.instanceId, device]));
  const points = assignmentPointBreakdown(spec, evaluation);
  const categories = [
    { id: 'overview', label: 'Overview', icon: FilePlus2, ...points.all },
    { id: 'devices', label: 'Devices & roles', icon: Users, ...points.devices },
    { id: 'must-connect', label: 'Must connect', icon: Cable, ...points.connect },
    { id: 'must-block', label: 'Must be blocked', icon: ShieldCheck, ...points.block },
    { id: 'segmentation', label: 'Segmentation', icon: Grid3X3, ...points.segmentation },
    { id: 'configuration', label: 'Configuration', icon: Cpu, ...points.configuration }
  ];
  useEffect(() => {
    const closeOnEscape = event => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const statusLabel = status => status === 'not_evaluable' ? 'Not ready' : status === 'passed' ? 'Complete' : 'Needs work';
  const requirementTitle = requirement => requirement.type === 'relationship'
    ? `${roleNames.get(requirement.from) || requirement.from} → ${roleNames.get(requirement.to) || requirement.to}`
    : `Separate ${requirement.roles.map(role => roleNames.get(role) || role).join(' and ')}`;
  const requirementDescription = requirement => requirement.type === 'relationship'
    ? requirement.action === 'allow'
      ? requirement.layer === 'l2'
        ? `${roleNames.get(requirement.from) || requirement.from} and ${roleNames.get(requirement.to) || requirement.to} must share a Layer 2 network (Ethernet frames can travel between them by MAC address; IP addresses are not required).`
        : `${roleNames.get(requirement.from) || requirement.from} must be able to ping ${roleNames.get(requirement.to) || requirement.to} at Layer 3 (valid IP addressing and any required routing must deliver IP packets).`
      : `${roleNames.get(requirement.from) || requirement.from} must not be able to initiate communication with ${roleNames.get(requirement.to) || requirement.to}.`
    : 'These roles must remain in separate Layer 2 broadcast domains (Ethernet broadcasts and local MAC-address traffic must not cross between them).';
  const friendlyReason = check => {
    if (check.status === 'passed') return check.expected === 'deny' ? 'Communication is correctly blocked by a working security policy.' : 'Communication is working as required.';
    if (check.observed === 'disconnected') return 'Both devices must be connected before this can be tested.';
    if (check.observed === 'unconfigured') return 'Both devices need valid IP address settings before this can be tested.';
    if (check.expected === 'deny' && check.status === 'not_evaluable') return 'The devices cannot communicate yet, but the network is not working well enough to prove that a security rule is blocking them.';
    if (check.expected === 'allow') return 'PacketTracker could not find a working path. Check the connections, VLANs, IP addresses, gateways, and routing.';
    return 'Communication is currently allowed, but this requirement says it must be blocked.';
  };
  const checkOutcome = check => check.status === 'passed' ? check.expected === 'deny' ? 'Correctly blocked' : 'Working' : check.status === 'not_evaluable' ? 'Not ready' : check.expected === 'deny' ? 'Not blocked' : 'Not working';
  const deviceWithAddress = deviceId => {
    const device = devicesById.get(deviceId);
    return { name: deviceNames.get(deviceId) || 'Unassigned device', address: devicePrimaryAddress(device) || 'No IP address' };
  };
  const toggleRequirement = requirementId => setExpandedRequirements(current => {
    const next = new Set(current);
    if (next.has(requirementId)) next.delete(requirementId); else next.add(requirementId);
    return next;
  });
  const relationshipCards = items => items.length ? items.map(requirement => {
    const passedChecks = requirement.checks?.filter(check => check.status === 'passed').length || 0;
    const totalChecks = requirement.checks?.length || 0;
    const expanded = expandedRequirements.has(requirement.id);
    const endpointGroups = [requirement.from, requirement.to].map(roleId => ({ roleId, name: roleNames.get(roleId) || roleId, devices: devices.filter(device => device.assignmentRoleId === roleId) }));
    return <article className={`challenge-requirement collapsible ${requirement.status} ${expanded ? 'expanded' : ''}`} key={requirement.id}>
      <button className="challenge-requirement-toggle" onClick={() => toggleRequirement(requirement.id)} aria-expanded={expanded}>
        <span className="challenge-requirement-main"><span className="challenge-requirement-status"><i/><span>{statusLabel(requirement.status)}</span></span><strong>{requirementTitle(requirement)}</strong><small>{requirementDescription(requirement)}</small><span className="challenge-card-progress"><b>{passedChecks}/{totalChecks || 1}</b><span>{requirement.action === 'allow' ? (requirement.layer === 'l2' ? 'Layer 2 paths working' : 'Layer 3 paths working') : 'connections correctly blocked'}</span></span></span>
        <ChevronDown size={21}/>
      </button>
      {expanded && <div className="challenge-requirement-expanded"><div className="challenge-assigned-endpoints">{endpointGroups.map(group => <section key={group.roleId}><strong>{group.name}</strong>{group.devices.length ? group.devices.map(device => <span key={device.instanceId}>{device.customName || device.name}<em>{devicePrimaryAddress(device) || 'No IP address'}</em></span>) : <small>No device assigned</small>}</section>)}</div>{requirement.reason && <div className="challenge-reason">Assign devices to both roles before this requirement can be tested.</div>}{!!requirement.checks?.length && <div className="challenge-check-list">{requirement.checks.map(check => { const source = deviceWithAddress(check.sourceDeviceId), destination = deviceWithAddress(check.destinationDeviceId); return <div className={check.status} key={check.id}><i/><span><span className="challenge-device-pair"><span>{source.name}<em>{source.address}</em></span><b>→</b><span>{destination.name}<em>{destination.address}</em></span></span><small>{friendlyReason(check)}</small></span><b>{checkOutcome(check)}</b></div>; })}</div>}</div>}
    </article>;
  }) : <div className="challenge-empty">There are no requirements in this section.</div>;

  return <div className="challenge-modal-backdrop" onPointerDown={onClose}>
    <section className="challenge-modal" role="dialog" aria-modal="true" aria-labelledby="challenge-title" onPointerDown={event => event.stopPropagation()}>
      <header className="challenge-modal-header"><div><span>Network challenge</span><h2 id="challenge-title">{spec.scenario.title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close challenge"><X size={19}/></button></header>
      <div className="challenge-modal-layout">
        <nav className="challenge-categories" aria-label="Challenge categories">
          {categories.map(category => <button key={category.id} className={activeCategory === category.id ? 'active' : ''} onClick={() => onCategoryChange(category.id)}><category.icon size={18}/><span><strong>{category.label}</strong><small>{category.passed}/{category.total} complete</small></span><b className={category.passed === category.total ? 'complete' : ''}>{category.passed}/{category.total}</b></button>)}
        </nav>
        <main className="challenge-details">
          {activeCategory === 'overview' && <><div className="challenge-section-heading"><span>Challenge brief</span><h3>{spec.scenario.title}</h3></div><p className="challenge-description">{spec.scenario.description}</p>{!!spec.scenario.objectives?.length && <section className="challenge-objectives"><h4>Objectives</h4>{spec.scenario.objectives.map((objective, index) => <div key={index}><i/>{objective}</div>)}</section>}<div className="challenge-overall-progress"><strong>{points.all.passed} of {points.all.total} checks complete</strong><span>{points.all.total - points.all.passed} individual checks remaining</span></div></>}
          {activeCategory === 'devices' && <><div className="challenge-section-heading"><span>Required equipment</span><h3>Devices and assignment roles</h3><p>Place compatible devices, then right-click each one and assign its role.</p></div><div className="challenge-requirement-list">{evaluation.roleStatus.map(role => { const definition = spec.roles.find(item => item.id === role.roleId); return <article className={`challenge-requirement ${role.status}`} key={role.roleId}><div className="challenge-requirement-status"><i/><span>{statusLabel(role.status)}</span></div><h4>{role.name}</h4><p>Assign exactly {role.required} compatible {role.required === 1 ? 'device' : 'devices'} to this role.</p><dl><div><dt>Assigned</dt><dd>{role.assigned}/{role.required}</dd></div><div><dt>Compatible types</dt><dd>{definition?.deviceTypes.join(', ') || 'None'}</dd></div></dl></article>; })}</div></>}
          {activeCategory === 'must-connect' && <><div className="challenge-section-heading"><span>Required communication</span><h3>Who must be able to connect?</h3><p>Make every communication path below work in the direction shown.</p></div><div className="challenge-requirement-list">{relationshipCards(allowedRelationships)}</div></>}
          {activeCategory === 'must-block' && <><div className="challenge-section-heading"><span>Required protection</span><h3>Who must be blocked?</h3><p>Use a working security policy to prevent the communication shown below. A broken or disconnected network does not count as successfully blocked.</p></div><div className="challenge-requirement-list">{relationshipCards(blockedRelationships)}</div></>}
          {activeCategory === 'segmentation' && <><div className="challenge-section-heading"><span>Local network separation</span><h3>Who must be kept on separate networks?</h3><p>Devices listed here must not share the same local broadcast network.</p></div><div className="challenge-requirement-list">{constraints.length ? constraints.map(requirement => <article className={`challenge-requirement ${requirement.status}`} key={requirement.id}><div className="challenge-requirement-status"><i/><span>{statusLabel(requirement.status)}</span></div><h4>{requirementTitle(requirement)}</h4><p>{requirementDescription(requirement)}</p>{!!requirement.checks?.length && <div className="challenge-check-list">{requirement.checks.map(check => <div className={check.status} key={check.id}><i/><span>{deviceNames.get(check.sourceDeviceId) || 'First device'} ↔ {deviceNames.get(check.destinationDeviceId) || 'Second device'}<small>{check.status === 'passed' ? 'These devices are correctly placed on separate local networks.' : 'These devices are still sharing the same local network.'}</small></span><b>{check.status === 'passed' ? 'Separated' : 'Needs work'}</b></div>)}</div>}</article>) : <div className="challenge-empty">This challenge has no network-separation requirements.</div>}</div></>}
          {activeCategory === 'configuration' && <><div className="challenge-section-heading"><span>Required device settings</span><h3>What must be configured?</h3><p>These checks inspect the actual saved device configuration and its effect on the simulated network.</p></div><div className="challenge-requirement-list">{configuration.length ? configuration.map(requirement => <article className={`challenge-requirement ${requirement.status}`} key={requirement.id}><div className="challenge-requirement-status"><i/><span>{statusLabel(requirement.status)}</span></div><h4>{requirement.title || 'Device configuration'}</h4><p>{requirement.description || 'Complete every required device setting.'}</p>{requirement.reason && <div className="challenge-reason">{requirement.reason}</div>}<div className="challenge-check-list">{requirement.checks?.map(check => <div className={check.status} key={check.id}><i/><span>{check.reason}</span><b>{check.status === 'passed' ? 'Complete' : 'Needs work'}</b></div>)}</div></article>) : <div className="challenge-empty">This challenge has no device-configuration requirements.</div>}</div></>}
        </main>
      </div>
    </section>
  </div>;
}

function PingDialog({ sourceId, targetId, devices, connections, onClose }) {
  const source = devices.find(device => device.instanceId === sourceId);
  const destination = devices.find(device => device.instanceId === targetId);
  const result = useMemo(() => runPing(devices, connections, sourceId, targetId), [devices, connections, sourceId, targetId]);
  const [visibleLines, setVisibleLines] = useState([]);
  const outputRef = useRef(null);

  useEffect(() => {
    if (!result) return;
    setVisibleLines([]);
    let index = 0;
    let timer;
    const revealNextLine = () => {
      index += 1;
      setVisibleLines(result.lines.slice(0, index));
      if (index >= result.lines.length) return;
      const line = result.lines[index] || '';
      const isPingAttempt = line.startsWith('Reply from ') || line.startsWith('Destination host unreachable') || line.startsWith('TTL expired');
      timer = setTimeout(revealNextLine, isPingAttempt ? 1250 : 180);
    };
    timer = setTimeout(revealNextLine, 250);
    return () => clearTimeout(timer);
  }, [result]);
  useEffect(() => { if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight; }, [visibleLines]);

  return <div className="modal-backdrop" onPointerDown={onClose}>
    <section className="ping-dialog" role="dialog" aria-modal="true" aria-labelledby="ping-dialog-title" onPointerDown={event => event.stopPropagation()}>
      <div className="server-picker-header"><div><span>Network diagnostic</span><h2 id="ping-dialog-title">Ping results</h2><p>{source?.customName || source?.name || 'Device'} → {destination?.customName || destination?.name || 'Destination'}</p></div><button className="icon-button" onClick={onClose} aria-label="Close ping"><X size={17}/></button></div>
      <div className="ping-terminal" ref={outputRef} aria-live="polite">
        {visibleLines.map((line, index) => <div key={`${index}-${line}`}>{line || ' '}</div>)}
        {visibleLines.length < result.lines.length && <span className="terminal-cursor" aria-hidden="true">_</span>}
      </div>
      <div className="ping-dialog-footer"><span><i className={result ? (result.delivered ? 'success' : 'failure') : ''}/>{result ? (result.delivered ? 'Reachable' : 'Unreachable') : 'Ready'}</span><button className="button secondary" onClick={onClose}>Close</button></div>
    </section>
  </div>;
}

function CliDialog({ item, sidePanelOpen = false, sidePanelWidth = 390, onSwitchingChange, onNgfwChange, onFirewallChange, onRouterChange, onDone }) {
  if (!item) return null;
  return <div className={`modal-backdrop cli-backdrop ${sidePanelOpen ? 'with-instructions' : ''}`} style={{ '--activity-panel-width': `${sidePanelWidth}px` }}>
    <section className="cli-dialog" role="dialog" aria-modal="true" aria-labelledby="cli-dialog-title" onPointerDown={event => event.stopPropagation()}>
      <div className="cli-dialog-header"><div><span>Device command line</span><h2 id="cli-dialog-title">{item.customName || item.name}</h2></div><p>Finish with <code>end</code>, or use <code>exit</code> from the top-level prompt.</p></div>
      {item.id === 'switch-managed' && <ManagedSwitchTerminal item={item} onSwitchingChange={onSwitchingChange} onDone={onDone}/>}
      {item.id === 'firewall-ngfw' && <NgfwTerminal item={item} onNgfwChange={onNgfwChange} onFirewallChange={onFirewallChange} onDone={onDone}/>}
      {['firewall-stateless', 'firewall-stateful'].includes(item.id) && <FirewallPolicyTerminal item={item} onFirewallChange={onFirewallChange} onDone={onDone}/>}
      {item.id === 'router-advanced' && <RouterTerminal item={item} onRouterChange={onRouterChange} onDone={onDone}/>}
    </section>
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
    const movementScale = displayScale() * (zoom / 100);
    const dx = (event.clientX - start.clientX) / movementScale;
    const dy = (event.clientY - start.clientY) / movementScale;
    if (start.mode === 'move') onChange({ x: Math.max(-CANVAS_ORIGIN_X + 20, start.x + dx), y: Math.max(-CANVAS_ORIGIN_Y + 20, start.y + dy) });
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
    const uiScale = displayScale();
    const maximum = Math.max(320, Math.min(640, window.innerWidth / uiScale - 120));
    onWidthChange(Math.max(260, Math.min(maximum, resize.current.width + (resize.current.x - event.clientX) / uiScale)));
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
      {validation.type === 'Trunk' && <section className="inspector-section"><h3>Trunk VLANs</h3><div className="trunk-vlan-detail"><div><span>Configured</span><strong>{validation.configuredVlans.length ? validation.configuredVlans.join(', ') : 'None'}</strong></div><div><span>Operational</span><strong>{validation.operationalVlans.length ? validation.operationalVlans.join(', ') : 'None'}</strong></div></div><div className="trunk-vlan-statuses">{validation.vlanStatuses.map(item => <span className={item.status} key={item.vlan}><i/>VLAN {item.vlan} · {item.status === 'operational' ? 'Operational' : item.status === 'unused' ? 'Not in use' : 'Incomplete'}</span>)}</div></section>}
      {validation.endpoints.some(endpoint => endpoint.interfaceConfig?.address) && <section className="inspector-section"><h3>IP configuration</h3><div className="connection-ip-list">{validation.endpoints.filter(endpoint => endpoint.interfaceConfig?.address).map(endpoint => <div key={endpoint.endpoint.deviceId}><span>{endpoint.device?.customName || endpoint.device?.name}</span><strong>{endpoint.interfaceConfig.address}/{endpoint.interfaceConfig.prefix ?? 24}</strong></div>)}</div></section>}
      {!!validation.problems.length && <section className="inspector-section diagnostics"><h3>What needs attention</h3>{validation.problems.map((problem, index) => <div key={problem}><CircleHelp size={13}/><span><strong>{problem}</strong><small>{validation.corrections[index] || 'Review the connected interface configuration.'}</small></span></div>)}</section>}
      {!validation.problems.length && <section className="inspector-section diagnostics success"><h3>Connection ready</h3><div><ShieldCheck size={14}/><span><strong>No link-level problems detected</strong><small>Security policies and end-to-end routing are still evaluated separately.</small></span></div></section>}
    </div>
  </aside>;
}

function DeviceInspector({ item, onClose, onInterfaceChange, onGatewayChange, connectMode, pendingPort, connections, allDevices, ipConflicts, onConnectPort, panel, onPanelChange, onSwitchingChange, onNgfwChange, onRouterChange, onNameChange, width, onWidthChange, cancelToken }) {
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
    const uiScale = displayScale();
    const maximum = Math.max(320, Math.min(640, window.innerWidth / uiScale - 120));
    onWidthChange(Math.max(260, Math.min(maximum, resize.current.width + (resize.current.x - event.clientX) / uiScale)));
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
    {!!ipConflicts.length && <div className="device-ip-conflict"><CircleHelp size={14}/><span><strong>Duplicate IP address detected</strong><small>{[...new Set(ipConflicts.map(conflict => conflict.address))].join(', ')} is already used by another device on this local network. Assign a unique address.</small></span></div>}
    {!definition ? <div className="inspector-empty">Detailed simulation is not available for this device yet.</div> : <>
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
        {ports.some(port => ['endpoint', 'endpoint-wireless'].includes(port.kind)) && <div className="gateway-config">
          <label htmlFor={`gateway-${item.instanceId}`}>Default gateway</label>
          <input id={`gateway-${item.instanceId}`} aria-label="Default gateway" placeholder="Example: 10.1.10.1" value={item.gateway || ''} onChange={event => onGatewayChange(item.instanceId, event.target.value)}/>
          <p>Required to reach devices outside this endpoint’s local subnet.</p>
        </div>}
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
  // Persist the session and scrollback, but never a draft command. A terminal
  // may close immediately after `end`/`exit`, before React flushes setCommand,
  // which would otherwise leave that completion command in the next prompt.
  try { localStorage.setItem(key, JSON.stringify({ session, command: '', lines: lines.slice(-500), history: history.slice(-100) })); }
  catch { /* Terminal persistence must not interrupt configuration. */ }
}

function shouldCloseCli(session, entered) {
  const command = entered.trim().toLowerCase().replace(/\s+/g, ' ');
  return command === 'end' || (command === 'exit' && ['user', 'privileged'].includes(session.mode));
}

function ManagedSwitchTerminal({ item, onSwitchingChange, onDone }) {
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
    if (shouldCloseCli(session, entered)) onDone?.();
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

function NgfwTerminal({ item, onNgfwChange, onFirewallChange, onDone }) {
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
    const result = executeNgfwCommand(session, item.ngfw, item.interfaces, entered, item.firewall);
    setLines(current => [...current, `${prompt} ${entered}`, ...result.output]);
    setSession(result.session);
    onNgfwChange(item.instanceId, result.config, result.interfaces, result.saved);
    onFirewallChange(item.instanceId, result.firewall, result.saved);
    commandHistory.current.push(entered); historyIndex.current = commandHistory.current.length; setCommand('');
    if (shouldCloseCli(session, entered)) onDone?.();
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
    <p className="terminal-help">Security policy: <code>policy 10</code>, then set <code>source-zone</code>, <code>destination-zone</code>, <code>protocol</code>, and <code>action</code>. Use <code>show policies</code> to verify order.</p>
  </section>;
}

function FirewallPolicyTerminal({ item, onFirewallChange, onDone }) {
  const initialLines = ['PacketTracker Firewall CLI', 'Start with: enable, configure terminal', 'Create an ordered rule with: policy 10', 'Type ? for available commands.'];
  const storageKey = `packettracker-terminal-firewall-${item.instanceId}`;
  const initialState = useRef(loadTerminalState(storageKey, createFirewallCliSession, initialLines)).current;
  const [session, setSession] = useState(initialState.session), [command, setCommand] = useState(initialState.command), [lines, setLines] = useState(initialState.lines);
  const commandHistory = useRef(initialState.history), historyIndex = useRef(initialState.history.length), outputRef = useRef(null);
  useEffect(() => { const saved = loadTerminalState(storageKey, createFirewallCliSession, initialLines); setSession(saved.session); setCommand(saved.command); setLines(saved.lines); commandHistory.current = saved.history; historyIndex.current = saved.history.length; }, [item.instanceId]);
  useEffect(() => saveTerminalState(storageKey, session, command, lines, commandHistory.current), [storageKey, session, command, lines]);
  useEffect(() => { if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight; }, [lines]);
  function runCommand(event) {
    event.preventDefault(); const entered = command.trim(); if (!entered) return;
    if (['clear', 'cls', 'clear screen'].includes(entered.toLowerCase())) { commandHistory.current.push(entered); historyIndex.current = commandHistory.current.length; setLines([]); setCommand(''); return; }
    const prompt = firewallPrompt(session, item.customName || item.name);
    const result = executeFirewallCommand(session, item.firewall, entered, item.customName || item.name);
    setLines(current => [...current, `${prompt} ${entered}`, ...result.output]); setSession(result.session); onFirewallChange(item.instanceId, result.firewall, result.saved);
    commandHistory.current.push(entered); historyIndex.current = commandHistory.current.length; setCommand(''); if (shouldCloseCli(session, entered)) onDone?.();
  }
  function navigateHistory(event) { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') { event.preventDefault(); setLines([]); } else if (event.key === 'ArrowUp') { event.preventDefault(); historyIndex.current = Math.max(0, historyIndex.current - 1); setCommand(commandHistory.current[historyIndex.current] || ''); } else if (event.key === 'ArrowDown') { event.preventDefault(); historyIndex.current = Math.min(commandHistory.current.length, historyIndex.current + 1); setCommand(commandHistory.current[historyIndex.current] || ''); } }
  return <section className="switch-terminal-section"><div className="terminal-status"><span className="terminal-dot"/> Ordered firewall policy configuration <small>{item.startupFirewall ? 'Saved configuration available' : 'Unsaved configuration'}</small></div><div className="switch-terminal" ref={outputRef} aria-live="polite">{lines.map((line, index) => <div key={`${index}-${line}`}>{line || ' '}</div>)}</div><form className="terminal-input" onSubmit={runCommand}><label>{firewallPrompt(session, item.customName || item.name)}</label><input autoFocus value={command} onChange={event => setCommand(event.target.value)} onKeyDown={navigateHistory} autoComplete="off" spellCheck="false" aria-label="Firewall policy command"/></form><p className="terminal-help">Policies use first-match order. Leave gaps such as 10, 20, 30 so another rule can be inserted later. Finish with an explicit catch-all policy, such as <code>policy 10000</code> followed by <code>action deny</code>.</p></section>;
}

function RouterTerminal({ item, onRouterChange, onDone }) {
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
    if (shouldCloseCli(session, entered)) onDone?.();
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

function PlacedDevice({ item, selected, pingSource, ipConflicts, interactionMode, zoom, cancelToken, onPingTarget, onConnect, onContextMenu, onSelect, onMove, onDelete }) {
  const Icon = item.icon;
  const physicalPorts = getDeviceDefinition(item.id)?.ports || [];
  const portSummary = physicalPorts.length === 1 ? `1 physical port · ${physicalPorts[0].label}` : physicalPorts.length ? `${physicalPorts.length} physical ports · ${physicalPorts.map(port => port.label).join(', ')}` : 'No physical network ports';
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
    if (interactionMode === 'ping') {
      onPingTarget(item.instanceId);
      return;
    }
    onSelect(item.instanceId);
    setDragging(true);
    dragOrigin.current = { x: item.x, y: item.y };
    offset.current = { clientX: event.clientX, clientY: event.clientY, x: item.x, y: item.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  return <div className={`placed-device ${selected ? 'selected' : ''} ${pingSource ? 'ping-source' : ''} ${dragging ? 'dragging' : ''} ${ipConflicts.length ? 'configuration-error' : ''}`} style={{ left: item.x, top: item.y, '--device-color': item.color }}
    onContextMenu={onContextMenu}
    onPointerDown={pointerDown}
    onPointerMove={event => { if (dragging) { const movementScale = displayScale() * (zoom / 100); onMove(item.instanceId, Math.max(-CANVAS_ORIGIN_X + 8, offset.current.x + (event.clientX - offset.current.clientX) / movementScale), Math.max(-CANVAS_ORIGIN_Y + 8, offset.current.y + (event.clientY - offset.current.clientY) / movementScale)); } }}
    onPointerUp={() => { setDragging(false); dragOrigin.current = null; }}>
    {selected && <button className="delete-device" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onDelete(); }}><Trash2 size={13}/></button>}
    {!!ipConflicts.length && <><span className="device-error-badge" title="Duplicate IP address"><TriangleAlert size={13}/></span><span className="device-error-label">IP conflict: {[...new Set(ipConflicts.map(conflict => conflict.address))].join(', ')}</span></>}
    <div className="placed-icon"><Icon size={29}/><span className="port-light"/></div>
    {item.assignmentRoleName && <span className="assignment-role-badge">{item.assignmentRoleName}</span>}
    <button className="placed-help" aria-label={`About ${item.customName || item.name}`} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
      <CircleHelp size={13}/>
      <span className="placed-tooltip" role="tooltip">
        <strong>{item.customName || item.name}</strong>
        {!!ipConflicts.length && <em className="tooltip-error">Duplicate IP: {[...new Set(ipConflicts.map(conflict => conflict.address))].join(', ')}</em>}
        <p>{item.purpose || item.model || 'A general-purpose network device.'}</p>
        <small>{portSummary}</small>
        {!!item.capabilities?.length && <span>{featureLabels(item.capabilities).join(' · ')}</span>}
      </span>
    </button>
  </div>;
}

function levelLabel(level) { return level === 'assisted' ? 'Hinted' : level ? `${level[0].toUpperCase()}${level.slice(1)}` : ''; }

function ActivityInstructionsPanel({ activity, tab, onTabChange, width, onWidthChange, specification, evaluation, points, onUseHint, onClose }) {
  const instruction = activity.definition.instructions[activity.attempt.requestedLevel] || {};
  const [revealed, setRevealed] = useState([]);
  const resize = useRef(null);
  const progress = points?.all || { passed: 0, total: 0 };
  const requirementName = requirement => requirement.title || (requirement.type === 'relationship' ? `${specification?.roles?.find(role => role.id === requirement.from)?.name || requirement.from} → ${specification?.roles?.find(role => role.id === requirement.to)?.name || requirement.to}` : requirement.type === 'constraint' ? 'Network separation' : 'Device configuration');
  function startResize(event) { event.preventDefault(); event.stopPropagation(); resize.current = { pointerId: event.pointerId }; event.currentTarget.setPointerCapture(event.pointerId); }
  function continueResize(event) { if (resize.current) onWidthChange(Math.max(300, Math.min(650, window.innerWidth - event.clientX))); }
  function stopResize(event) { resize.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }
  return <aside className="activity-instructions-panel" style={{ width }} role="complementary" aria-labelledby="activity-instructions-title" onPointerDown={event => event.stopPropagation()}>
      <div className="activity-panel-resize-handle" role="separator" aria-label="Resize activity panel" aria-orientation="vertical" tabIndex="0" onPointerDown={startResize} onPointerMove={continueResize} onPointerUp={stopResize} onPointerCancel={stopResize} onKeyDown={event => { if (event.key === 'ArrowLeft') onWidthChange(Math.min(650, width + 20)); else if (event.key === 'ArrowRight') onWidthChange(Math.max(300, width - 20)); }}/>
      <header><div><span>{levelLabel(activity.attempt.requestedLevel)} level</span><h2 id="activity-instructions-title">{activity.definition.title}</h2></div><button className="icon-button" onClick={onClose}><X size={18}/></button></header>
      <nav className="activity-panel-tabs" aria-label="Activity information"><button className={tab === 'instructions' ? 'active' : ''} onClick={() => onTabChange('instructions')}>Instructions</button><button className={tab === 'challenge' ? 'active' : ''} onClick={() => onTabChange('challenge')}>Challenge <small>{progress.passed}/{progress.total}</small></button></nav>
      {tab === 'instructions' ? <div className="activity-instructions-body"><p className="activity-summary">{instruction.summary}</p>
        {!!instruction.objectives?.length && <section><h3>What you need to accomplish</h3><ul>{instruction.objectives.map(objective => <li key={objective}>{objective}</li>)}</ul></section>}
        {!!instruction.steps?.length && <section><h3>Steps</h3><ol>{instruction.steps.map(step => <li key={step}>{step}</li>)}</ol></section>}
        {!!instruction.hints?.length && <section><h3>Hints</h3><div className="activity-hints">{instruction.hints.map((hint, index) => revealed.includes(index) ? <p key={hint}>{hint}</p> : <button key={hint} onClick={() => { setRevealed(current => [...current, index]); onUseHint?.(`hint-${index + 1}`); }}>Reveal hint {index + 1}</button>)}</div></section>}
      </div> : <div className="activity-challenge-body">
        <div className="activity-challenge-progress"><div><strong>{progress.passed} of {progress.total} complete</strong><span>{progress.total && progress.passed === progress.total ? 'Ready to check and complete' : `${Math.max(0, progress.total - progress.passed)} checks remaining`}</span></div><i><b style={{ width: `${progress.total ? progress.passed / progress.total * 100 : 0}%` }}/></i></div>
        <section><h3>Devices and roles</h3>{evaluation?.roleStatus?.map(role => <div className={`activity-progress-item ${role.status}`} key={role.roleId}><i/><span><strong>{role.name}</strong><small>{role.compatible} of {role.required} assigned</small></span><b>{role.status === 'passed' ? 'Complete' : 'Needs work'}</b></div>)}</section>
        <section><h3>Network requirements</h3>{evaluation?.requirements?.map(requirement => { const incomplete = requirement.checks?.find(check => check.status !== 'passed'); return <div className={`activity-progress-item ${requirement.status}`} key={requirement.id}><i/><span><strong>{requirementName(requirement)}</strong><small>{requirement.status === 'passed' ? 'All checks complete.' : requirement.reason || incomplete?.reason || 'Review this requirement.'}</small></span><b>{requirement.status === 'passed' ? 'Complete' : requirement.status === 'not_evaluable' ? 'Not ready' : 'Needs work'}</b></div>; })}</section>
      </div>}
  </aside>;
}

function ActivityResultModal({ result, level, onClose, onBack }) {
  const passed = result.evaluation?.completed;
  return <div className="activity-modal-backdrop"><section className={`activity-result-modal ${passed ? 'passed' : 'incomplete'}`} role="dialog" aria-modal="true">
    <div className="activity-result-icon">{passed ? <GraduationCap size={34}/> : <CircleHelp size={34}/>}</div>
    <h2>{passed ? 'Skill completed' : 'Not quite yet'}</h2>
    <p>{passed ? `You completed this activity at the ${levelLabel(result.attempt.awardedLevel || level)} level.` : 'Your work is saved. Review the challenge status, make another change, and check again.'}</p>
    {!passed && result.evaluation?.requirements?.filter(item => item.status !== 'passed').map(item => <small key={item.id}>{item.reason || item.checks?.find(check => check.status !== 'passed')?.reason || 'A network requirement is not complete.'}</small>)}
    <div>{!passed && <button className="button secondary" onClick={onClose}>Keep working</button>}{passed && <button className="button primary" onClick={onBack}>Return to skills</button>}</div>
  </section></div>;
}

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.details?.length ? `${body.error}: ${body.details.join(' ')}` : body?.error || `Request failed (${response.status})`);
  return body;
}

function prepareActivityDocument(definition, document) {
  const prepared = structuredClone(document || definition.startingNetwork);
  if (definition.key === 'connect-two-pcs' && prepared.devices?.some(device => Number(device.x) > 1500)) {
    prepared.devices = prepared.devices.map(device => ({ ...device, x: Number(device.x) - 2020, y: Number(device.y) - 1720 }));
    return { document: prepared, changed: true };
  }
  return { document: prepared, changed: false };
}

function PlatformApp() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState(null);
  const [activeActivity, setActiveActivity] = useState(null);
  const [dashboardRevision, setDashboardRevision] = useState(0);
  const [dashboardTab, setDashboardTab] = useState('classes');
  const [difficultyWarning, setDifficultyWarning] = useState(null);

  useEffect(() => {
    api('/api/session').then(async result => {
      setUser(result.user);
      if (!result.user) return;
      let view = null;
      try { view = JSON.parse(localStorage.getItem(`packettracker-view-${result.user.id}`) || 'null'); } catch { /* use dashboard */ }
      if (view?.tab) setDashboardTab(view.tab);
      else setDashboardTab(result.user.role === 'student' ? 'projects' : 'classes');
      if (view?.page === 'activity' && view.attemptId) {
        try {
          let [attempt, activityRecord] = await Promise.all([api(`/api/skill-attempts/${view.attemptId}`), api(`/api/skill-activities/${view.activityId}`)]);
          const prepared = prepareActivityDocument(activityRecord.definition, attempt.workingDocument);
          if (prepared.changed && attempt.status === 'in_progress') attempt = await api(`/api/skill-attempts/${attempt.id}`, { method: 'PUT', body: JSON.stringify({ document: prepared.document }) });
          setActiveActivity({ attempt, definition: activityRecord.definition, activityId: activityRecord.id });
          setProject({ id: `skill-attempt-${attempt.id}`, owner_id: result.user.id, name: activityRecord.definition.title, document: prepared.changed ? prepared.document : attempt.workingDocument, assignment: { specification: activityRecord.definition.requirements.specification }, isSkillActivity: true });
        } catch { localStorage.removeItem(`packettracker-view-${result.user.id}`); }
      } else if (view?.page === 'project' && view.projectId) {
        try {
          if (view.preview) {
            const preview = JSON.parse(localStorage.getItem(`packettracker-assignment-preview-${result.user.id}`) || 'null');
            if (!preview || preview.id !== view.projectId) throw new Error('Preview not found');
            setProject(preview);
          } else setProject(await api(`/api/projects/${view.projectId}`));
        }
        catch { localStorage.removeItem(`packettracker-view-${result.user.id}`); }
      }
    }).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  async function openProject(id) {
    const loaded = await api(`/api/projects/${id}`);
    setProject(loaded);
    localStorage.setItem(`packettracker-view-${user.id}`, JSON.stringify({ page: 'project', projectId: id, tab: 'projects' }));
  }

  function openAssignmentPreview(assignment) {
    const preview = {
      id: `assignment-preview-${assignment.id}-${Date.now()}`,
      owner_id: user.id,
      name: assignment.title,
      document: { version: 2, devices: [], connections: [], notes: [], segments: [] },
      assignment: { id: assignment.id, title: assignment.title, specification: assignment.specification },
      isAssignmentPreview: true,
      savedProjectId: assignment.project_id || null
    };
    localStorage.setItem(`packettracker-assignment-preview-${user.id}`, JSON.stringify(preview));
    localStorage.setItem(`packettracker-view-${user.id}`, JSON.stringify({ page: 'project', projectId: preview.id, preview: true, tab: 'assignments' }));
    setProject(preview);
  }

  function showDashboardTab(tab) {
    setDashboardTab(tab);
    if (user) localStorage.setItem(`packettracker-view-${user.id}`, JSON.stringify({ page: 'dashboard', tab }));
  }

  async function openSkillActivity(activityRecord, level = null, replaceOpen = false) {
    let attempt = (await api(`/api/skill-activities/${activityRecord.id}/open-attempt`)).attempt;
    if (level && attempt) {
      if (!replaceOpen) {
        setDifficultyWarning({ activityRecord, level, currentLevel: attempt.requestedLevel });
        return;
      }
      await api(`/api/skill-attempts/${attempt.id}/abandon`, { method: 'POST' });
      attempt = null;
    }
    if (!attempt) attempt = await api(`/api/skill-activities/${activityRecord.id}/attempts`, { method: 'POST', body: JSON.stringify({ level: level || activityRecord.definition.supportedLevels[0] }) });
    const prepared = prepareActivityDocument(activityRecord.definition, attempt.workingDocument);
    if (prepared.changed) attempt = await api(`/api/skill-attempts/${attempt.id}`, { method: 'PUT', body: JSON.stringify({ document: prepared.document }) });
    const activityState = { attempt, definition: activityRecord.definition, activityId: activityRecord.id };
    setActiveActivity(activityState);
    setProject({ id: `skill-attempt-${attempt.id}`, owner_id: user.id, name: activityRecord.definition.title, document: prepared.changed ? prepared.document : attempt.workingDocument, assignment: { specification: activityRecord.definition.requirements.specification }, isSkillActivity: true });
    localStorage.setItem(`packettracker-view-${user.id}`, JSON.stringify({ page: 'activity', activityId: activityRecord.id, attemptId: attempt.id, tab: 'skills' }));
  }

  if (loading) return <div className="platform-loading"><div className="brand-mark"><img src="/packettrackerfavicon.png" alt=""/></div><span>Loading PacketTracker…</span></div>;
  if (!user) return <AuthScreen onAuthenticated={authenticatedUser => { setDashboardTab(authenticatedUser.role === 'student' ? 'projects' : 'classes'); setUser(authenticatedUser); }}/>;
  if (project) return <EditorApp key={project.id} project={project} user={user} activity={activeActivity} readOnly={project.owner_id !== user.id} onBack={() => { showDashboardTab(project.isSkillActivity ? 'skills' : project.isAssignmentPreview ? 'assignments' : 'projects'); setProject(null); setActiveActivity(null); setDashboardRevision(value => value + 1); }} onActivityReset={activeActivity ? async () => {
    await openSkillActivity({ id: activeActivity.activityId, definition: activeActivity.definition }, activeActivity.attempt.requestedLevel, true);
  } : null} onActivitySave={activeActivity ? async (document, updates = {}) => {
    const saved = await api(`/api/skill-attempts/${activeActivity.attempt.id}`, { method: 'PUT', body: JSON.stringify({ document, ...updates }) });
    setActiveActivity(current => current ? { ...current, attempt: saved } : current);
    return saved;
  } : null} onActivityComplete={activeActivity ? async document => {
    await api(`/api/skill-attempts/${activeActivity.attempt.id}`, { method: 'PUT', body: JSON.stringify({ document }) });
    const result = await api(`/api/skill-attempts/${activeActivity.attempt.id}/complete`, { method: 'POST' });
    setActiveActivity(current => current ? { ...current, attempt: result.attempt } : current);
    return result;
  } : null} onSave={project.owner_id === user.id ? async document => {
    if (project.isAssignmentPreview) {
      const overwrite = Boolean(project.savedProjectId);
      if (overwrite && !window.confirm('This assignment already has a saved example. Saving this preview will replace the previous example. Continue?')) throw new Error('Save cancelled — the previous example was not changed.');
      const saved = await api(`/api/assignments/${project.assignment.id}/example`, { method: 'PUT', body: JSON.stringify({ document, overwrite }) });
      localStorage.removeItem(`packettracker-assignment-preview-${user.id}`);
      localStorage.removeItem(projectDraftKey(project.id));
      localStorage.setItem(`packettracker-view-${user.id}`, JSON.stringify({ page: 'project', projectId: saved.id, tab: 'assignments' }));
      setProject(saved);
      return;
    }
    const saved = await api(`/api/projects/${project.id}`, { method: 'PUT', body: JSON.stringify({ name: project.name, document }) });
    setProject(current => ({ ...current, ...saved }));
  } : null}/>;
  return <><Dashboard key={dashboardRevision} user={user} initialTab={dashboardTab} onTabChange={showDashboardTab} onOpenProject={openProject} onOpenSkillActivity={openSkillActivity} onPreviewAssignment={openAssignmentPreview} onLogout={async () => { localStorage.removeItem(`packettracker-view-${user.id}`); await api('/api/auth/logout', { method: 'POST' }); setUser(null); }}/>
    {difficultyWarning && <DifficultyWarningModal
      currentLevel={difficultyWarning.currentLevel}
      nextLevel={difficultyWarning.level}
      activityTitle={difficultyWarning.activityRecord.definition.title}
      onCancel={() => setDifficultyWarning(null)}
      onConfirm={() => { const pending = difficultyWarning; setDifficultyWarning(null); openSkillActivity(pending.activityRecord, pending.level, true); }}
    />}
  </>;
}

function DifficultyWarningModal({ currentLevel, nextLevel, activityTitle, onCancel, onConfirm }) {
  useEffect(() => {
    function handleKeyDown(event) { if (event.key === 'Escape') onCancel(); }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);
  return <div className="skill-warning-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="skill-warning-modal" role="alertdialog" aria-modal="true" aria-labelledby="skill-warning-title" aria-describedby="skill-warning-description">
      <div className="skill-warning-icon"><TriangleAlert size={25}/></div>
      <div className="skill-warning-copy"><span>Change difficulty</span><h2 id="skill-warning-title">Start {levelLabel(nextLevel)} instead?</h2><p id="skill-warning-description">You already have a {levelLabel(currentLevel)} attempt in progress for <strong>{activityTitle}</strong>. Starting at a different difficulty will discard the network and progress saved in that attempt.</p></div>
      <div className="skill-warning-levels"><span><small>Current attempt</small><strong>{levelLabel(currentLevel)}</strong></span><ChevronRight size={17}/><span><small>New attempt</small><strong>{levelLabel(nextLevel)}</strong></span></div>
      <footer><button className="button secondary" autoFocus onClick={onCancel}>Keep current attempt</button><button className="button skill-warning-confirm" onClick={onConfirm}>Discard and start {levelLabel(nextLevel)}</button></footer>
    </section>
  </div>;
}

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [role, setRole] = useState('student');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await api(`/api/auth/${mode}`, { method: 'POST', body: JSON.stringify(mode === 'register' ? { ...values, role } : values) });
      onAuthenticated(result.user);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  return <main className="auth-page">
    <NetworkConstellationBackground/>
    <section className="auth-intro"><div className="auth-branding"><img className="auth-logo" src="/packettracker-logo-with-text.png" alt="PacketTracker"/></div><h1>Let’s network</h1><div className="auth-feature"><GraduationCap size={20}/><span><strong>Designed for education</strong><small>Realistic, vendor-neutral network learning</small></span></div></section>
    <section className="auth-card"><h2>{mode === 'login' ? 'Sign in' : 'Create new account'}</h2>
      {mode === 'register' && <div className="role-choice"><button className={role === 'student' ? 'active' : ''} onClick={() => setRole('student')}><GraduationCap size={18}/><span><strong>Student</strong><small>Join with a class code</small></span></button><button className={role === 'teacher' ? 'active' : ''} onClick={() => setRole('teacher')}><Users size={18}/><span><strong>Teacher</strong><small>Create and manage classes</small></span></button></div>}
      <form className="auth-form" onSubmit={submit}>{mode === 'register' && <label>Full name<input name="name" required autoComplete="name"/></label>}<label>Email address<input name="email" type="email" required autoComplete="email"/></label><label>Password<input name="password" type="password" minLength="8" required autoComplete={mode === 'login' ? 'current-password' : 'new-password'}/></label>{mode === 'register' && role === 'student' && <label>Class code<input name="classCode" required maxLength="12" autoCapitalize="characters" placeholder="Example: ABCD234"/></label>}{error && <div className="form-error">{error}</div>}<button className="button primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button><button type="button" className="auth-mode-link" onClick={() => { setMode(current => current === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'Create new account' : 'Already have an account? Sign in'}</button></form>
    </section>
  </main>;
}

function NetworkConstellationBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext('2d');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const nodes = [
      { x: .018, y: .13, color: '#00d8ee', size: 2 }, { x: .072, y: .055, color: '#7c5cff', size: 2 }, { x: .145, y: .11, color: '#00d8ee', size: 4 }, { x: .222, y: .065, color: '#66ee72', size: 3 }, { x: .035, y: .28, color: '#965cff', size: 4 }, { x: .094, y: .35, color: '#00d8ee', size: 4 },
      { x: .008, y: .68, color: '#00d8ee', size: 2 }, { x: .073, y: .63, color: '#8b5cff', size: 2 }, { x: .027, y: .79, color: '#67ee82', size: 4 }, { x: .156, y: .84, color: '#00d8ee', size: 5 }, { x: .205, y: .93, color: '#00d8ee', size: 2 }, { x: .298, y: .91, color: '#8b5cff', size: 2 },
      { x: .754, y: .055, color: '#8b5cff', size: 2 }, { x: .817, y: .11, color: '#00d8ee', size: 4 }, { x: .926, y: .035, color: '#68ee76', size: 4 }, { x: .934, y: .25, color: '#8b5cff', size: 3 },
      { x: .907, y: .61, color: '#00d8ee', size: 5 }, { x: .955, y: .76, color: '#8b5cff', size: 2 }, { x: .835, y: .85, color: '#00d8ee', size: 4 }, { x: .764, y: .95, color: '#00d8ee', size: 2 }, { x: .654, y: .92, color: '#68ee76', size: 4 }, { x: .955, y: .93, color: '#00d8ee', size: 3 }
    ];
    const edgePairs = [[0,1],[0,2],[1,2],[1,4],[2,3],[2,4],[2,5],[4,5],[6,7],[6,8],[7,8],[8,9],[9,10],[9,11],[10,11],[12,13],[12,14],[13,14],[13,15],[14,15],[15,17],[16,17],[16,18],[16,21],[17,18],[18,19],[18,21],[19,20],[19,21],[20,21]];
    const edges = edgePairs.map(([from, to], index) => ({ from, to, color: index % 7 === 0 ? '#8b5cff' : index % 5 === 0 ? '#54e878' : '#00cce4' }));
    const particles = [], pulses = new Map();
    let width = 0, height = 0, frame = 0, nextSpawn = performance.now() + 900, lastDraw = 0, hiddenAt = null;

    function resize() {
      const bounds = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = bounds.width; height = bounds.height;
      canvas.width = Math.max(1, Math.round(width * dpr)); canvas.height = Math.max(1, Math.round(height * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(performance.now());
    }
    function spawn(now) {
      const edgeIndex = Math.floor(Math.random() * edges.length), reverse = Math.random() > .5;
      particles.push({ edgeIndex, reverse, start: now, duration: 2000 + Math.random() * 2000 });
      nextSpawn = now + 900 + Math.random() * 2500;
    }
    function draw(now) {
      context.clearRect(0, 0, width, height);
      context.lineWidth = .75;
      for (const edge of edges) {
        const a = nodes[edge.from], b = nodes[edge.to];
        context.strokeStyle = `${edge.color}38`; context.beginPath(); context.moveTo(a.x * width, a.y * height); context.lineTo(b.x * width, b.y * height); context.stroke();
      }
      nodes.forEach((node, index) => {
        const pulseStarted = pulses.get(index), pulseProgress = pulseStarted == null ? 1 : Math.min(1, (now - pulseStarted) / 600);
        if (pulseProgress >= 1) pulses.delete(index);
        const pulse = pulseProgress < 1 ? Math.sin(pulseProgress * Math.PI) : 0, radius = node.size + pulse * 2.5;
        context.save(); context.shadowColor = node.color; context.shadowBlur = 7 + pulse * 10; context.fillStyle = node.color; context.globalAlpha = .72 + pulse * .28; context.beginPath(); context.arc(node.x * width, node.y * height, radius, 0, Math.PI * 2); context.fill(); context.restore();
      });
      for (let index = particles.length - 1; index >= 0; index--) {
        const particle = particles[index], edge = edges[particle.edgeIndex], raw = (now - particle.start) / particle.duration;
        if (raw >= 1) { pulses.set(particle.reverse ? edge.from : edge.to, now); particles.splice(index, 1); continue; }
        const progress = particle.reverse ? 1 - raw : raw, a = nodes[edge.from], b = nodes[edge.to], fade = Math.min(1, raw * 7, (1 - raw) * 7);
        context.save(); context.globalAlpha = fade; context.shadowColor = '#d7ffff'; context.shadowBlur = 8; context.fillStyle = '#c9ffff'; context.beginPath(); context.arc((a.x + (b.x - a.x) * progress) * width, (a.y + (b.y - a.y) * progress) * height, 1.7, 0, Math.PI * 2); context.fill(); context.restore();
      }
    }
    function animate(now) {
      if (!document.hidden) {
        if (now >= nextSpawn && particles.length < 3) spawn(now);
        if (now - lastDraw >= 32) { draw(now); lastDraw = now; }
      } else nextSpawn = now + 1000;
      frame = requestAnimationFrame(animate);
    }
    function handleVisibility() {
      if (document.hidden) hiddenAt = performance.now();
      else if (hiddenAt != null) {
        const pausedFor = performance.now() - hiddenAt;
        particles.forEach(particle => { particle.start += pausedFor; });
        nextSpawn += pausedFor; hiddenAt = null;
      }
    }
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
    document.addEventListener('visibilitychange', handleVisibility);
    if (!reduceMotion) frame = requestAnimationFrame(animate);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', handleVisibility); cancelAnimationFrame(frame); };
  }, []);

  return <canvas ref={canvasRef} className="network-constellation" aria-hidden="true"/>;
}

function completedSkillDetails(student) {
  const byActivity = new Map((student.progress || []).map(skill => [skill.activityId, { activityId: skill.activityId, title: skill.title, highestLevel: skill.highestLevel, completedLevels: [skill.highestLevel] }]));
  for (const skill of student.skillBreakdown || []) {
    const progress = byActivity.get(skill.activityId);
    const highestLevel = skill.highestLevel || skill.completedLevels?.at(-1) || progress?.highestLevel || null;
    const completedLevels = skill.completedLevels?.length ? skill.completedLevels : progress?.completedLevels || (highestLevel ? [highestLevel] : []);
    if (highestLevel) byActivity.set(skill.activityId, { activityId: skill.activityId, title: skill.title || progress?.title || 'Skill activity', highestLevel, completedLevels });
  }
  return [...byActivity.values()].filter(skill => skill.highestLevel);
}

function TeacherClassCard({ course, students, expanded, onToggle, onPresentCode, onManageCode }) {
  return <article className={`teacher-class-card ${expanded ? 'expanded' : ''}`}>
    <div className="teacher-class-summary"><button className="class-expand-button" onClick={onToggle} aria-expanded={expanded}>{expanded ? <ChevronDown size={18}/> : <ChevronRight size={18}/>}<span><strong>{course.name}</strong><small>{course.student_count} student{course.student_count === 1 ? '' : 's'}</small></span></button><div className="class-code-controls">{course.join_code_active ? <><button className="join-code-button" onClick={() => onPresentCode({ code: course.join_code, className: course.name })} title="Display join code"><code>{course.join_code}</code></button><button onClick={() => onManageCode(course.id, 'regenerate')} title="Generate a different join code"><RotateCcw size={14}/>Change</button><button className="disable-code" onClick={() => onManageCode(course.id, 'disable')} title="Stop students from using this code"><X size={14}/>Disable</button></> : <><span>Join code disabled</span><button onClick={() => onManageCode(course.id, 'regenerate')}><RotateCcw size={14}/>Create code</button></>}</div></div>
    {expanded && <div className="class-student-roster">{students.map(student => { const totals = student.totals || { total: 0, completed: 0, guided: 0, assisted: 0, independent: 0, incomplete: 0 }, completedSkills = completedSkillDetails(student); return <section className="student-skill-row" key={student.id}><div className="student-skill-heading"><span><strong>{student.name}</strong><small>{student.email}</small></span><b>{totals.completed} / {totals.total} skills</b></div><div className="student-progress-bar aggregate" tabIndex="0" aria-label={`${student.name}: ${totals.guided} guided, ${totals.assisted} hinted, ${totals.independent} independent, ${totals.incomplete} incomplete`}>{totals.total ? <>{totals.guided > 0 && <i className="guided" style={{ flex: totals.guided }}/>} {totals.assisted > 0 && <i className="assisted" style={{ flex: totals.assisted }}/>} {totals.independent > 0 && <i className="independent" style={{ flex: totals.independent }}/>} {totals.incomplete > 0 && <i className="incomplete" style={{ flex: totals.incomplete }}/>}</> : <i className="incomplete" style={{ flex: 1 }}/>}<div className="student-graph-tooltip"><header><strong>{student.name}</strong><span>{totals.completed} of {totals.total} skills completed</span></header><div>{completedSkills.map(skill => <p key={skill.activityId}><i className={skill.highestLevel}/><span>{skill.title}</span><b className="skill-tooltip-levels">{skill.completedLevels.map(level => <small key={level} className={level}>{levelLabel(level)}</small>)}</b></p>)}{!completedSkills.length && <em>No skills completed yet.</em>}</div></div></div></section>; })}{!students.length && <p>No students have joined this class yet.</p>}</div>}
  </article>;
}

function SkillActivityCard({ item, progress, attempts, onStart }) {
  const [expanded, setExpanded] = useState(false);
  const completedLevels = new Set((attempts || []).filter(attempt => attempt.status === 'completed').map(attempt => attempt.awardedLevel));
  const openAttempt = (attempts || []).find(attempt => attempt.status === 'in_progress');
  const levelButton = level => {
    const completed = completedLevels.has(level);
    return item.definition.supportedLevels.includes(level) && <button key={level} className={`button secondary skill-start-button ${completed ? 'completed' : ''}`} onClick={() => onStart(item, level)}>{completed ? `${levelLabel(level)} Completed` : `Start ${levelLabel(level)}`}</button>;
  };
  return <article className={`skill-activity-card ${expanded ? 'expanded' : 'collapsed'}`}>
    <button className="skill-card-toggle" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}><span>{expanded ? <ChevronDown size={18}/> : <ChevronRight size={18}/>}<strong>{item.definition.title}</strong></span></button>
    <div className="skill-card-actions"><div className="skill-start-buttons">{openAttempt && <button className="button skill-resume-button" onClick={() => onStart(item)}>Resume {levelLabel(openAttempt.requestedLevel)}</button>}{levelButton('guided')}{levelButton('independent')}</div></div>
    {expanded && <div className="skill-card-details"><span>{item.definition.category}</span><p>{item.definition.description}</p><div>{item.definition.skills.map(skill => <small key={skill}>{skill.replaceAll('-', ' ')}</small>)}</div>{(openAttempt || progress) && <footer>{openAttempt && <span className="skill-in-progress"><RotateCcw size={13}/>{levelLabel(openAttempt.requestedLevel)} in progress</span>}{progress && <span className={`skill-level-badge ${progress.highestLevel}`}><GraduationCap size={14}/>Highest proficiency: {levelLabel(progress.highestLevel)}</span>}</footer>}</div>}
  </article>;
}

function Dashboard({ user, initialTab = 'classes', onTabChange, onOpenProject, onOpenSkillActivity, onPreviewAssignment, onLogout }) {
  const [data, setData] = useState({ classes: [], classStudents: [], projects: [], sharedProjects: [], assignments: [], activities: [], skillProgress: [], skillTotals: null, activityAttempts: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newClass, setNewClass] = useState('');
  const [joinCodeValue, setJoinCodeValue] = useState('');
  const [newProject, setNewProject] = useState('');
  const [teacherTab, setTeacherTab] = useState(initialTab);
  const [classModalOpen, setClassModalOpen] = useState(false);
  const classNameRef = useRef(null);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const projectNameRef = useRef(null);
  const [presentedJoinCode, setPresentedJoinCode] = useState(null);
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [assignmentJson, setAssignmentJson] = useState('');
  const [assignmentClassTarget, setAssignmentClassTarget] = useState(null);
  const [selectedAssignmentClasses, setSelectedAssignmentClasses] = useState([]);
  const [assignmentPromptCopied, setAssignmentPromptCopied] = useState(false);
  const [expandedClasses, setExpandedClasses] = useState([]);
  const [skillCategory, setSkillCategory] = useState('all');
  const classRosterInitializedRef = useRef(false);

  const refresh = async () => {
    try {
      const [dashboard, library, progress] = await Promise.all([api('/api/dashboard'), api('/api/skill-activities'), api('/api/skill-progress')]);
      const activities = library.activities || [], activityAttempts = {};
      await Promise.all(activities.map(async item => { activityAttempts[item.id] = (await api(`/api/skill-activities/${item.id}/attempts`)).attempts || []; }));
      setData({ ...dashboard, activities, skillProgress: progress?.progress || [], skillTotals: progress?.totals || null, activityAttempts });
      if (user.role === 'teacher' && !classRosterInitializedRef.current) { setExpandedClasses((dashboard.classes || []).map(course => course.id)); classRosterInitializedRef.current = true; }
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (!classModalOpen) return undefined;
    const frame = requestAnimationFrame(() => classNameRef.current?.focus());
    const closeOnEscape = event => { if (event.key === 'Escape') setClassModalOpen(false); };
    document.addEventListener('keydown', closeOnEscape);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', closeOnEscape); };
  }, [classModalOpen]);
  useEffect(() => {
    if (!projectModalOpen) return undefined;
    const frame = requestAnimationFrame(() => projectNameRef.current?.focus());
    const closeOnEscape = event => { if (event.key === 'Escape') setProjectModalOpen(false); };
    document.addEventListener('keydown', closeOnEscape);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', closeOnEscape); };
  }, [projectModalOpen]);
  useEffect(() => {
    if (!presentedJoinCode) return undefined;
    const closeOnEscape = event => { if (event.key === 'Escape') setPresentedJoinCode(null); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [presentedJoinCode]);
  async function createClass(event) { event.preventDefault(); await api('/api/classes', { method: 'POST', body: JSON.stringify({ name: newClass }) }); setNewClass(''); setClassModalOpen(false); refresh(); }
  async function joinClass(event) { event.preventDefault(); await api('/api/classes/join', { method: 'POST', body: JSON.stringify({ code: joinCodeValue }) }); setJoinCodeValue(''); refresh(); }
  async function createProject(event) { event.preventDefault(); const created = await api('/api/projects', { method: 'POST', body: JSON.stringify({ name: newProject || 'Untitled Network' }) }); setProjectModalOpen(false); onOpenProject(created.id); }
  async function removeProject(id) { await api(`/api/projects/${id}`, { method: 'DELETE' }); refresh(); }
  async function shareProject(projectId, classId) { await api(`/api/projects/${projectId}/share`, { method: 'POST', body: JSON.stringify({ classId }) }); refresh(); }
  async function manageJoinCode(classId, action) {
    try {
      await api(`/api/classes/${classId}/join-code`, { method: 'PATCH', body: JSON.stringify({ action }) });
      setPresentedJoinCode(null); refresh();
    } catch (requestError) { setError(requestError.message); }
  }
  async function importAssignment(event) {
    event.preventDefault(); setError('');
    try {
      const specification = JSON.parse(assignmentJson);
      await api('/api/assignments', { method: 'POST', body: JSON.stringify({ specification }) });
      setAssignmentJson(''); setAssignmentModalOpen(false); refresh();
    } catch (requestError) { setError(requestError instanceof SyntaxError ? `Invalid JSON: ${requestError.message}` : requestError.message); }
  }
  async function startAssignment(assignment) {
    if (assignment.project_id) return onOpenProject(assignment.project_id);
    const project = await api('/api/projects', { method: 'POST', body: JSON.stringify({ name: assignment.title, assignmentId: assignment.id }) });
    onOpenProject(project.id);
  }
  async function assignToClasses(event) {
    event.preventDefault();
    try {
      await api(`/api/assignments/${assignmentClassTarget.id}/classes`, { method: 'PUT', body: JSON.stringify({ classIds: selectedAssignmentClasses }) });
      setAssignmentClassTarget(null); refresh();
    } catch (requestError) { setError(requestError.message); }
  }

  const classesPanel = <section className="dashboard-panel classes-panel"><div className="dashboard-panel-title"><div><Users size={18}/><span><strong>{user.role === 'teacher' ? 'Classes' : 'My class'}</strong><small>{user.role === 'teacher' ? `${data.classes.length} owned` : data.classes.length ? 'Your enrolled class' : 'Not enrolled yet'}</small></span></div>{user.role === 'teacher' && <button className="panel-add-button" onClick={() => setClassModalOpen(true)} aria-label="Create a class" title="Create a class"><Plus size={23}/></button>}</div>
    {user.role === 'teacher' && <div className="skill-progress-legend"><span><i className="guided"/>Guided</span><span><i className="assisted"/>Hinted</span><span><i className="independent"/>Independent</span><span><i className="incomplete"/>Incomplete</span></div>}
    {user.role === 'student' && data.classes.length === 0 && <form className="inline-create" onSubmit={joinClass}><input required value={joinCodeValue} onChange={event => setJoinCodeValue(event.target.value)} placeholder="Enter class code"/><button className="button primary">Join</button></form>}
    <div className="class-list">{data.classes.map(course => user.role === 'teacher' ? <TeacherClassCard key={course.id} course={course} students={data.classStudents.filter(student => student.class_id === course.id)} expanded={expandedClasses.includes(course.id)} onToggle={() => setExpandedClasses(current => current.includes(course.id) ? current.filter(id => id !== course.id) : [...current, course.id])} onPresentCode={setPresentedJoinCode} onManageCode={manageJoinCode}/> : <article key={course.id}><div><strong>{course.name}</strong><small>Teacher: {course.teacher_name}</small></div></article>)}{!data.classes.length && <p>No classes yet.</p>}</div>
  </section>;
  const projectsPanel = <section className="dashboard-panel projects-panel"><div className="dashboard-panel-title"><div><FolderOpen size={18}/><span><strong>My projects</strong><small>{data.projects.length} saved projects</small></span></div><button className="panel-add-button" onClick={() => setProjectModalOpen(true)} aria-label="Create a project" title="Create a project"><Plus size={23}/></button></div>
    <div className="project-list">{data.projects.map(item => <article key={item.id}><button className="project-open" onClick={() => onOpenProject(item.id)}><span className="project-icon"><Network size={18}/></span><span><strong>{item.name}</strong><small>Updated {new Date(item.updated_at).toLocaleString()}</small></span></button><div>{user.role === 'student' && data.classes.length > 0 && <button title="Share with teacher" onClick={() => shareProject(item.id, data.classes[0].id)}><Share2 size={14}/>{item.shared ? 'Shared' : 'Share'}</button>}<button className="danger-link" onClick={() => removeProject(item.id)}><Trash2 size={14}/></button></div></article>)}{!data.projects.length && <p>Create your first network project.</p>}</div>
  </section>;
  const sharedPanel = <section className="dashboard-panel shared-panel"><div className="dashboard-panel-title"><div><Share2 size={18}/><span><strong>Shared with me</strong><small>Student projects for review</small></span></div></div><div className="project-list">{data.sharedProjects.map(item => <article key={item.id}><button className="project-open" onClick={() => onOpenProject(item.id)}><span className="project-icon"><Network size={18}/></span><span><strong>{item.name}</strong><small>{item.owner_name}{item.class_name ? ` · ${item.class_name}` : ''}</small></span></button></article>)}{!data.sharedProjects.length && <p>No student projects have been shared yet.</p>}</div></section>;
  const assignmentsPanel = <section className="dashboard-panel assignments-panel"><div className="dashboard-panel-title"><div><FilePlus2 size={18}/><span><strong>Assignments</strong><small>{data.assignments.length} available</small></span></div>{user.role === 'teacher' && <button className="panel-add-button" onClick={() => setAssignmentModalOpen(true)} aria-label="Create assignment" title="Create assignment from JSON"><Plus size={23}/></button>}</div>
    <div className="assignment-list">{data.assignments.map(assignment => <article key={assignment.id}><div><span>{assignment.classNames?.length ? assignment.classNames.join(' · ') : user.role === 'teacher' ? 'Not assigned' : 'Assignment'}</span><strong>{assignment.title}</strong><p>{assignmentDescription(assignment.specification.scenario.description)}</p><small>{assignment.specification.roles.length} roles · {assignment.specification.relationships.length} reachability checks</small></div>{user.role === 'student' ? <button className="button primary" onClick={() => startAssignment(assignment)}>{assignment.project_id ? 'Open project' : 'Start assignment'}</button> : <div className="assignment-actions"><button className="button secondary" onClick={() => onPreviewAssignment(assignment)}>Open preview</button>{assignment.project_id && <button className="button secondary saved-example-button" onClick={() => onOpenProject(assignment.project_id)}>Open saved</button>}<button className="button primary" onClick={() => { setAssignmentClassTarget(assignment); setSelectedAssignmentClasses(assignment.classIds || []); }}>Assign to classes</button><small>{assignment.student_projects} student project{assignment.student_projects === 1 ? '' : 's'}</small></div>}</article>)}{!data.assignments.length && <p>{user.role === 'teacher' ? 'Create an assignment from JSON, test it privately, then assign it to one or more classes.' : 'Your teacher has not published any assignments yet.'}</p>}</div>
  </section>;
  const skillCategories = [...new Set(data.activities.map(item => item.definition.category))].sort();
  const completedActivityIds = new Set(data.skillProgress.map(item => item.activityId));
  const incompleteActivities = data.activities.filter(item => !completedActivityIds.has(item.id));
  const visibleActivities = skillCategory === 'incomplete' ? incompleteActivities : skillCategory === 'all' ? data.activities : data.activities.filter(item => item.definition.category === skillCategory);
  const visibleSkillCategories = [...new Set(visibleActivities.map(item => item.definition.category))].sort();
  const totals = data.skillTotals || { total: data.activities.length, completed: 0, guided: 0, assisted: 0, independent: 0, incomplete: data.activities.length };
  const skillsPanel = <section className="dashboard-panel skills-panel"><div className="dashboard-panel-title skills-library-header"><div><GraduationCap size={18}/><span><strong>Skills Library</strong><small>{totals.completed} of {totals.total} skills completed</small></span></div><div className="skill-library-progress" title={`${totals.guided} guided · ${totals.assisted} hinted · ${totals.independent} independent · ${totals.incomplete} incomplete`} aria-label={`${totals.guided} guided, ${totals.assisted} hinted, ${totals.independent} independent, ${totals.incomplete} incomplete`}>{totals.total ? <>{totals.guided > 0 && <i className="guided" style={{ flex: totals.guided }}/>} {totals.assisted > 0 && <i className="assisted" style={{ flex: totals.assisted }}/>} {totals.independent > 0 && <i className="independent" style={{ flex: totals.independent }}/>} {totals.incomplete > 0 && <i className="incomplete" style={{ flex: totals.incomplete }}/>}</> : <i className="incomplete" style={{ flex: 1 }}/>}</div></div>
    <nav className="skill-category-filters" aria-label="Skill categories"><button className={skillCategory === 'all' ? 'active' : ''} onClick={() => setSkillCategory('all')}>All skills <small>{data.activities.length}</small></button><button className={skillCategory === 'incomplete' ? 'active incomplete-filter' : 'incomplete-filter'} onClick={() => setSkillCategory('incomplete')}>Incomplete <small>{incompleteActivities.length}</small></button>{skillCategories.map(category => <button key={category} className={skillCategory === category ? 'active' : ''} onClick={() => setSkillCategory(category)}>{category}<small>{data.activities.filter(item => item.definition.category === category).length}</small></button>)}</nav>
    <div className="skill-activity-list">{visibleSkillCategories.map(category => { const categoryActivities = visibleActivities.filter(item => item.definition.category === category); return <React.Fragment key={category}><div className="skill-category-heading"><strong>{category}</strong><span>{categoryActivities.length} skill{categoryActivities.length === 1 ? '' : 's'}</span></div>{categoryActivities.map(item => <SkillActivityCard key={item.id} item={item} progress={data.skillProgress.find(entry => entry.activityId === item.id)} attempts={data.activityAttempts[item.id] || []} onStart={onOpenSkillActivity}/>)}</React.Fragment>; })}{!visibleActivities.length && <p>{skillCategory === 'incomplete' ? 'You have completed every available skill.' : 'No skill activities are available in this category.'}</p>}</div>
  </section>;
  const dashboardPanels = { classes: classesPanel, projects: projectsPanel, shared: sharedPanel, assignments: assignmentsPanel, skills: skillsPanel };
  const selectDashboardTab = tab => { setTeacherTab(tab); onTabChange?.(tab); };

  return <div className={`dashboard-shell ${user.role === 'teacher' ? 'teacher-dashboard' : 'student-dashboard'}`}><NetworkConstellationBackground/><header className="dashboard-topbar"><div className="brand"><div className="brand-mark"><img src="/packettrackerfavicon.png" alt=""/></div><span>Packet<span>Tracker</span></span></div><div><span>{user.name}</span><small>{user.role}</small><button className="icon-button" title="Sign out" onClick={onLogout}><LogOut size={17}/></button></div></header>
    <main className="dashboard-main"><section className="dashboard-welcome"><h1>{user.role === 'teacher' ? 'Teacher Dashboard' : 'Student Dashboard'}</h1></section>
      {error && <div className="form-error">{error}</div>}{loading ? <div className="dashboard-loading">Loading your workspace…</div> : <div className="teacher-workspace">
        <nav className="teacher-tabs" aria-label={`${user.role === 'teacher' ? 'Teacher' : 'Student'} workspace sections`}>
          {user.role === 'student' && <button className={teacherTab === 'projects' ? 'active' : ''} onClick={() => selectDashboardTab('projects')}><FolderOpen size={18}/><span>Projects</span><small>{data.projects.length}</small></button>}
          {user.role === 'student' && <button className={teacherTab === 'skills' ? 'active' : ''} onClick={() => selectDashboardTab('skills')}><GraduationCap size={18}/><span>Skills</span><small>{data.activities.length}</small></button>}
          {user.role === 'student' && <button className={teacherTab === 'assignments' ? 'active' : ''} onClick={() => selectDashboardTab('assignments')}><FilePlus2 size={18}/><span>Assignments</span><small>{data.assignments.length}</small></button>}
          <button className={teacherTab === 'classes' ? 'active' : ''} onClick={() => selectDashboardTab('classes')}><Users size={18}/><span>{user.role === 'teacher' ? 'Classes' : 'Class Info'}</span><small>{data.classes.length}</small></button>
          {user.role === 'teacher' && <button className={teacherTab === 'projects' ? 'active' : ''} onClick={() => selectDashboardTab('projects')}><FolderOpen size={18}/><span>Projects</span><small>{data.projects.length}</small></button>}
          {user.role === 'teacher' && <button className={teacherTab === 'skills' ? 'active' : ''} onClick={() => selectDashboardTab('skills')}><GraduationCap size={18}/><span>Skills</span><small>{data.activities.length}</small></button>}
          {user.role === 'teacher' && <button className={teacherTab === 'assignments' ? 'active' : ''} onClick={() => selectDashboardTab('assignments')}><FilePlus2 size={18}/><span>Assignments</span><small>{data.assignments.length}</small></button>}
          {user.role === 'teacher' && <button className={teacherTab === 'shared' ? 'active' : ''} onClick={() => selectDashboardTab('shared')}><Share2 size={18}/><span>Shared with me</span><small>{data.sharedProjects.length}</small></button>}
        </nav>
        <div className="teacher-tab-content">{dashboardPanels[teacherTab === 'shared' && user.role !== 'teacher' ? 'classes' : teacherTab]}</div>
      </div>}
    </main>
    {classModalOpen && <div className="class-modal-backdrop" onPointerDown={() => setClassModalOpen(false)}>
      <section className="class-create-modal" role="dialog" aria-modal="true" aria-labelledby="class-create-title" onPointerDown={event => event.stopPropagation()}>
        <header><div><span>New class</span><h2 id="class-create-title">Create a class</h2></div><button className="icon-button" onClick={() => setClassModalOpen(false)} aria-label="Close"><X size={17}/></button></header>
        <form onSubmit={createClass}><label htmlFor="new-class-name">Class name</label><input ref={classNameRef} id="new-class-name" required value={newClass} onChange={event => setNewClass(event.target.value)} placeholder="Example: Network Fundamentals"/><div><button type="button" className="button secondary" onClick={() => setClassModalOpen(false)}>Cancel</button><button className="button primary">Create</button></div></form>
      </section>
    </div>}
    {projectModalOpen && <div className="class-modal-backdrop" onPointerDown={() => setProjectModalOpen(false)}>
      <section className="class-create-modal" role="dialog" aria-modal="true" aria-labelledby="project-create-title" onPointerDown={event => event.stopPropagation()}>
        <header><div><span>New project</span><h2 id="project-create-title">Create a project</h2></div><button className="icon-button" onClick={() => setProjectModalOpen(false)} aria-label="Close"><X size={17}/></button></header>
        <form onSubmit={createProject}><label htmlFor="new-project-name">Project name</label><input ref={projectNameRef} id="new-project-name" required value={newProject} onChange={event => setNewProject(event.target.value)} placeholder="Example: Branch Office Network"/><div><button type="button" className="button secondary" onClick={() => setProjectModalOpen(false)}>Cancel</button><button className="button primary">Create</button></div></form>
      </section>
    </div>}
    {assignmentModalOpen && <div className="class-modal-backdrop" onPointerDown={() => setAssignmentModalOpen(false)}>
      <section className="class-create-modal assignment-import-modal" role="dialog" aria-modal="true" aria-labelledby="assignment-import-title" onPointerDown={event => event.stopPropagation()}>
        <header><div><span>Assignment JSON</span><h2 id="assignment-import-title">Create assignment</h2></div><div className="assignment-modal-tools"><button className="copy-prompt-button" onClick={async () => { await navigator.clipboard.writeText(ASSIGNMENT_AI_PROMPT); setAssignmentPromptCopied(true); setTimeout(() => setAssignmentPromptCopied(false), 1800); }} title="Copy the AI assignment interview prompt" aria-label="Copy AI prompt"><Copy size={17}/></button><button className="icon-button" onClick={() => setAssignmentModalOpen(false)} aria-label="Close"><X size={17}/></button></div></header>
        {assignmentPromptCopied && <div className="prompt-copied">AI interview prompt copied</div>}<form onSubmit={importAssignment}><p className="assignment-import-help">Use the copy button above with an AI assistant, then paste the JSON it gives you below. Creating an assignment does not publish it to students.</p><label htmlFor="assignment-json">Paste assignment JSON</label><textarea id="assignment-json" autoFocus required value={assignmentJson} onChange={event => setAssignmentJson(event.target.value)} placeholder="Paste the JSON from your AI assistant here"/><div><button type="button" className="button secondary" onClick={() => setAssignmentModalOpen(false)}>Cancel</button><button className="button primary">Create assignment</button></div></form>
      </section>
    </div>}
    {assignmentClassTarget && <div className="class-modal-backdrop" onPointerDown={() => setAssignmentClassTarget(null)}><section className="class-create-modal assignment-class-modal" role="dialog" aria-modal="true" aria-labelledby="assignment-class-title" onPointerDown={event => event.stopPropagation()}><header><div><span>Publish assignment</span><h2 id="assignment-class-title">Assign “{assignmentClassTarget.title}”</h2></div><button className="icon-button" onClick={() => setAssignmentClassTarget(null)}><X size={17}/></button></header><form onSubmit={assignToClasses}><p>Select every class that should receive this assignment. Clearing all selections returns it to private draft status.</p><div className="assignment-class-options">{data.classes.map(course => <label key={course.id}><input type="checkbox" checked={selectedAssignmentClasses.includes(course.id)} onChange={event => setSelectedAssignmentClasses(current => event.target.checked ? [...current, course.id] : current.filter(id => id !== course.id))}/><span><strong>{course.name}</strong><small>{course.student_count} students</small></span></label>)}{!data.classes.length && <p>Create a class before publishing assignments.</p>}</div><div><button type="button" className="button secondary" onClick={() => setAssignmentClassTarget(null)}>Cancel</button><button className="button primary">Save class assignments</button></div></form></section></div>}
    {presentedJoinCode && <div className="join-code-presentation" role="dialog" aria-modal="true" aria-labelledby="join-code-title">
      <div className="join-code-display"><span id="join-code-title">Join {presentedJoinCode.className}</span><strong>{presentedJoinCode.code}</strong><button onClick={() => setPresentedJoinCode(null)}>Close</button></div>
    </div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><PlatformApp /></React.StrictMode>);
