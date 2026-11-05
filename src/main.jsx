import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AppWindow, Box, Cable, ChevronDown, ChevronRight, CircleHelp, Cloud, Cpu,
  Database, Download, Ellipsis, EthernetPort, FilePlus2, Gauge, Grid3X3,
  HardDrive, Headphones, HousePlug, Laptop, LockKeyhole, Menu, Minus, Monitor,
  MousePointer2, Network, PanelLeftClose, PanelLeftOpen, Phone, Plus, Printer,
  RadioTower, Redo2, RotateCcw, Router, Save, Search, Server, ShieldCheck,
  Smartphone, Sparkles, SquareDashedMousePointer, Trash2, Undo2, Upload,
  Video, Wifi, X, ZoomIn, ZoomOut
} from 'lucide-react';
import './styles.css';
import { getDeviceDefinition } from './simulation/definitions.js';

const categories = [
  { id: 'routers', label: 'Routers', icon: Router },
  { id: 'switches', label: 'Switches', icon: EthernetPort },
  { id: 'hubs', label: 'Hubs', icon: Network },
  { id: 'wireless', label: 'Wireless', icon: Wifi },
  { id: 'security', label: 'Security', icon: ShieldCheck },
  { id: 'wan', label: 'WAN Emulation', icon: Cloud },
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
  deepInspection: 'Deep inspection'
};

const devices = [
  { id: 'router-basic', name: 'Basic Router', category: 'routers', icon: Router, color: '#5f79ff', ports: '2 network interfaces', purpose: 'Connects and routes traffic between two networks.', capabilities: ['ip', 'routing'] },
  { id: 'router-home', name: 'Home Router', category: 'routers', icon: Wifi, color: '#5f79ff', ports: '4 LAN · 1 WAN · Wi-Fi', purpose: 'An all-in-one gateway for a small home network.', capabilities: ['ip', 'routing', 'switching', 'wifi', 'dhcp', 'nat', 'statefulFirewall'] },
  { id: 'router-advanced', name: 'Advanced Router', category: 'routers', icon: Router, color: '#5f79ff', ports: '4 routed interfaces', purpose: 'Routes larger networks with address and traffic controls.', capabilities: ['ip', 'routing', 'dhcp', 'nat', 'acl', 'statelessFirewall'] },
  { id: 'switch-basic', name: 'Basic Switch', category: 'switches', icon: EthernetPort, color: '#16a3a6', ports: '8 Ethernet ports', purpose: 'Connects wired devices on one local network.', capabilities: ['switching'] },
  { id: 'switch-managed', name: 'Managed Switch', category: 'switches', icon: EthernetPort, color: '#16a3a6', ports: '8 Ethernet ports', purpose: 'A configurable switch for segmented local networks.', capabilities: ['switching'] },
  { id: 'hub', name: 'Repeater Hub', category: 'hubs', icon: Network, color: '#d68a28', model: 'Hub-PT' },
  { id: 'repeater', name: 'Repeater', category: 'hubs', icon: RadioTower, color: '#d68a28', model: 'Repeater-PT' },
  { id: 'ap', name: 'Access Point', category: 'wireless', icon: Wifi, color: '#7c62c8', model: 'AccessPoint-PT' },
  { id: 'wireless-router', name: 'Wireless Gateway', category: 'wireless', icon: RadioTower, color: '#7c62c8', ports: '4 LAN · 1 WAN · Wi-Fi', purpose: 'Connects wireless devices to a small wired network.', capabilities: ['switching', 'wifi', 'dhcp', 'nat'] },
  { id: 'cell-tower', name: 'Cell Tower', category: 'wireless', icon: RadioTower, color: '#7c62c8', model: 'Cell Tower' },
  { id: 'firewall-stateless', name: 'Stateless Firewall', category: 'security', icon: ShieldCheck, color: '#df5a60', ports: '2 network interfaces', purpose: 'Checks each packet against ordered IP, port, and protocol rules.', capabilities: ['statelessFirewall', 'acl'] },
  { id: 'firewall-stateful', name: 'Stateful Firewall', category: 'security', icon: ShieldCheck, color: '#df5a60', ports: '2 network interfaces', purpose: 'Tracks connections so legitimate return traffic can pass.', capabilities: ['statelessFirewall', 'statefulFirewall', 'acl'] },
  { id: 'firewall-ngfw', name: 'Next-Generation Firewall', category: 'security', icon: ShieldCheck, color: '#df5a60', ports: '4 network interfaces', purpose: 'Identifies applications and inspects traffic for threats.', capabilities: ['statefulFirewall', 'appAwareness', 'ips', 'deepInspection'] },
  { id: 'vpn', name: 'VPN Concentrator', category: 'security', icon: LockKeyhole, color: '#df5a60', model: 'VPN-PT' },
  { id: 'cloud', name: 'Network Cloud', category: 'wan', icon: Cloud, color: '#4b98d1', model: 'Cloud-PT' },
  { id: 'dsl', name: 'DSL Modem', category: 'wan', icon: Box, color: '#4b98d1', model: 'DSL Modem' },
  { id: 'cable-modem', name: 'Cable Modem', category: 'wan', icon: Cable, color: '#4b98d1', model: 'Cable Modem' },
  { id: 'pc', name: 'Desktop PC', category: 'end', icon: Monitor, color: '#647182', model: 'PC-PT' },
  { id: 'laptop', name: 'Laptop', category: 'end', icon: Laptop, color: '#647182', model: 'Laptop-PT' },
  { id: 'server', name: 'Server', category: 'end', icon: Server, color: '#647182', model: 'Server-PT' },
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
  firewall: 'firewall-stateful'
};

const featureLabels = featureIds => (featureIds || []).map(id => capabilities[id] || id);

const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

function loadSavedDesign() {
  try {
    const saved = JSON.parse(localStorage.getItem('packettracker-design') || '[]');
    if (!Array.isArray(saved)) return [];

    return saved.map(item => {
      const migratedId = legacyDeviceMigrations[item.id] || item.id;
      const catalogDevice = devices.find(device => device.id === migratedId);
      const definition = getDeviceDefinition(migratedId);
      const category = categories.find(entry => entry.id === item.category);
      return {
        ...item,
        ...(catalogDevice || {}),
        id: migratedId,
        instanceId: item.instanceId,
        x: item.x,
        y: item.y,
        label: catalogDevice ? catalogDevice.name : item.label,
        interfaces: { ...(definition?.defaults?.interfaces || {}), ...(item.interfaces || {}) },
        icon: catalogDevice?.icon || category?.icon || AppWindow,
        color: catalogDevice?.color || item.color || '#647182'
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
  const [toast, setToast] = useState('');
  const [activeTool, setActiveTool] = useState('select');
  const [pendingPort, setPendingPort] = useState(null);
  const [connectPointer, setConnectPointer] = useState(null);
  const [areaSelection, setAreaSelection] = useState(null);
  const [segmentDrawing, setSegmentDrawing] = useState(null);
  const [segmentDraft, setSegmentDraft] = useState({ label: 'Network segment', color: '#5f79ff' });
  const [selectedIds, setSelectedIds] = useState([]);
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
  const connectMode = activeTool === 'connect';

  const filtered = useMemo(() => devices.filter(device =>
    (query ? `${device.name} ${device.model || ''} ${device.purpose || ''} ${featureLabels(device.capabilities).join(' ')}`.toLowerCase().includes(query.toLowerCase()) : device.category === activeCategory)
  ), [query, activeCategory]);

  useEffect(() => localStorage.setItem('packettracker-design', JSON.stringify(serializeDesign(placed))), [placed]);
  useEffect(() => localStorage.setItem('packettracker-connections', JSON.stringify(connections)), [connections]);
  useEffect(() => localStorage.setItem('packettracker-notes', JSON.stringify(notes)), [notes]);
  useEffect(() => localStorage.setItem('packettracker-segments', JSON.stringify(segments)), [segments]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  function addDevice(device, point) {
    const canvas = canvasRef.current?.getBoundingClientRect();
    const x = point ? (point.clientX - canvas.left) / (zoom / 100) : 160 + (placed.length % 5) * 115;
    const y = point ? (point.clientY - canvas.top) / (zoom / 100) : 130 + Math.floor(placed.length / 5) * 105;
    const definition = getDeviceDefinition(device.id);
    const item = {
      ...device,
      instanceId: uid(),
      x: Math.max(30, x - 40),
      y: Math.max(30, y - 35),
      label: device.name,
      interfaces: structuredClone(definition?.defaults?.interfaces || {})
    };
    setPlaced(current => [...current, item]);
    setSelected(item.instanceId);
  }

  function moveDevice(instanceId, x, y) {
    setPlaced(current => current.map(item => item.instanceId === instanceId ? { ...item, x, y } : item));
  }

  function updateInterface(instanceId, interfaceId, field, value) {
    setPlaced(current => current.map(item => item.instanceId === instanceId ? {
      ...item,
      interfaces: {
        ...(item.interfaces || {}),
        [interfaceId]: {
          ...(item.interfaces?.[interfaceId] || {}),
          [field]: field === 'prefix' ? Math.max(0, Math.min(32, Number(value))) : value
        }
      }
    } : item));
  }

  function connectPort(deviceId, portId) {
    const endpoint = { deviceId, portId };
    const inUse = connections.some(connection => [connection.a, connection.b].some(end => end.deviceId === deviceId && end.portId === portId));
    if (inUse) return setToast('That port is already connected');
    if (!pendingPort) {
      setPendingPort(endpoint);
      const device = placed.find(item => item.instanceId === deviceId);
      if (device) setConnectPointer({ x: device.x + 47, y: device.y + 23 });
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
    setConnections(current => [...current, { id: uid(), a: pendingPort, b: endpoint }]);
    setPendingPort(null);
    setConnectPointer(null);
    setToast('Devices connected');
  }

  function connectDevice(deviceId) {
    const device = placed.find(item => item.instanceId === deviceId);
    const definition = getDeviceDefinition(device?.id);
    if (!definition) return setToast('This device does not have connectable ports yet');
    if (pendingPort?.deviceId === deviceId) return setToast('Choose a different device');

    const sourceDevice = pendingPort && placed.find(item => item.instanceId === pendingPort.deviceId);
    const sourcePort = pendingPort && getDeviceDefinition(sourceDevice?.id)?.ports.find(port => port.id === pendingPort.portId);
    const sourceWireless = sourcePort && ['wireless', 'endpoint-wireless'].includes(sourcePort.kind);
    const availablePort = definition.ports.find(port => {
      const inUse = connections.some(connection => [connection.a, connection.b].some(end => end.deviceId === deviceId && end.portId === port.id));
      const wireless = ['wireless', 'endpoint-wireless'].includes(port.kind);
      return !inUse && (!sourcePort || wireless === sourceWireless);
    });
    if (!availablePort) return setToast(sourcePort ? 'No compatible free port on that device' : 'That device has no free ports');
    setSelected(deviceId);
    connectPort(deviceId, availablePort.id);
  }

  function setTool(tool) {
    setActiveTool(tool);
    setPendingPort(null);
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
    }
  }

  function handleCanvasPointerMove(event) {
    if (activeTool === 'connect' && pendingPort) setConnectPointer(canvasPoint(event));
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
    const matches = placed.filter(item => item.x + 47 >= left && item.x + 47 <= right && item.y + 35 >= top && item.y + 35 <= bottom).map(item => item.instanceId);
    setSelectedIds(matches);
    setAreaSelection(null);
    setToast(`${matches.length} ${matches.length === 1 ? 'device' : 'devices'} selected`);
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
        <button className="icon-button" title="Undo" disabled><Undo2 size={17}/></button>
        <button className="icon-button" title="Redo" disabled><Redo2 size={17}/></button>
        <div className="divider" />
        <button className="button secondary" onClick={exportDesign}><Download size={16}/> Export</button>
        <button className="button primary" onClick={saveDesign}><Save size={16}/> Save design</button>
        <button className="avatar">TF</button>
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
              {filtered.map(device => <button key={device.id} className="device-card" draggable onDragStart={e => e.dataTransfer.setData('deviceId', device.id)} onClick={() => addDevice(device)}>
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
        <div className="canvas-toolbar">
          <button className={`tool ${activeTool === 'select' ? 'active' : ''}`} onClick={() => setTool('select')}><MousePointer2 size={17}/><span>Select</span></button>
          <button className={`tool ${activeTool === 'connect' ? 'active' : ''}`} onClick={() => setTool('connect')}><Cable size={17}/><span>Connect</span></button>
          <button className={`tool ${activeTool === 'area' ? 'active' : ''}`} onClick={() => setTool('area')}><SquareDashedMousePointer size={17}/><span>Area</span></button>
          <button className={`tool ${activeTool === 'segment' ? 'active' : ''}`} onClick={() => setTool('segment')}><Box size={17}/><span>Add segment</span></button>
          <div className="divider" />
          <button className={`tool ${activeTool === 'note' ? 'active' : ''}`} onClick={() => setTool('note')}><FilePlus2 size={17}/><span>Note</span></button>
        </div>
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
        <div ref={canvasRef} className={`canvas tool-${activeTool}`} onDragOver={e => e.preventDefault()} onDrop={e => {
          e.preventDefault(); const device = devices.find(d => d.id === e.dataTransfer.getData('deviceId')); if (device) addDevice(device, e);
        }} onPointerDown={handleCanvasPointerDown} onPointerMove={handleCanvasPointerMove} onPointerUp={handleCanvasPointerUp}>
          <div className="canvas-content" style={{ transform: `scale(${zoom / 100})` }}>
            {segments.map(segment => <NetworkSegment key={segment.id} segment={segment} onChange={updates => setSegments(current => current.map(item => item.id === segment.id ? { ...item, ...updates } : item))} onDelete={() => setSegments(current => current.filter(item => item.id !== segment.id))}/>)}
            {segmentDrawing && <div className="network-segment drawing" style={{
              '--segment-color': segmentDraft.color,
              left: Math.min(segmentDrawing.startX, segmentDrawing.x),
              top: Math.min(segmentDrawing.startY, segmentDrawing.y),
              width: Math.abs(segmentDrawing.x - segmentDrawing.startX),
              height: Math.abs(segmentDrawing.y - segmentDrawing.startY)
            }}><span>{segmentDraft.label || 'Network segment'}</span></div>}
            <svg className="connection-layer" width="1400" height="900" aria-label="Network connections">
              {connections.map(connection => {
                const a = placed.find(item => item.instanceId === connection.a.deviceId);
                const b = placed.find(item => item.instanceId === connection.b.deviceId);
                return a && b ? <line key={connection.id} x1={a.x + 47} y1={a.y + 23} x2={b.x + 47} y2={b.y + 23}/> : null;
              })}
              {pendingPort && connectPointer && (() => {
                const source = placed.find(item => item.instanceId === pendingPort.deviceId);
                return source ? <line className="connection-preview" x1={source.x + 47} y1={source.y + 23} x2={connectPointer.x} y2={connectPointer.y}/> : null;
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
            {notes.map(note => <CanvasNote key={note.id} note={note} onChange={text => setNotes(current => current.map(item => item.id === note.id ? { ...item, text } : item))} onDelete={() => setNotes(current => current.filter(item => item.id !== note.id))}/>)}
            {placed.map(item => <PlacedDevice key={item.instanceId} item={item} selected={selected === item.instanceId || selectedIds.includes(item.instanceId)} interactionMode={activeTool} onConnect={connectDevice} onSelect={instanceId => { setSelected(instanceId); setSelectedIds([]); }} onMove={moveDevice} onDelete={() => { setPlaced(current => current.filter(d => d.instanceId !== item.instanceId)); setConnections(current => current.filter(connection => connection.a.deviceId !== item.instanceId && connection.b.deviceId !== item.instanceId)); setSelected(null); }} />)}
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
          onConnectPort={connectPort}
        />}
      </section>
    </main>
    {toast && <div className="toast"><span>✓</span>{toast}</div>}
  </div>;
}

function CanvasNote({ note, onChange, onDelete }) {
  return <div className="note-card" style={{ left: note.x, top: note.y }} onPointerDown={event => event.stopPropagation()}>
    <div><span>Note</span><button onClick={onDelete} title="Delete note"><X size={12}/></button></div>
    <textarea autoFocus={!note.text} value={note.text} onChange={event => onChange(event.target.value)} placeholder="Type a note…" />
  </div>;
}

function NetworkSegment({ segment, onChange, onDelete }) {
  return <div className="network-segment" style={{ '--segment-color': segment.color, left: segment.x, top: segment.y, width: segment.width, height: segment.height }} onPointerDown={event => event.stopPropagation()}>
    <div className="segment-label">
      <input value={segment.label} onChange={event => onChange({ label: event.target.value })} aria-label="Edit segment label" />
      <input className="segment-color-input" type="color" value={segment.color} onChange={event => onChange({ color: event.target.value })} aria-label="Edit segment color" />
      <button onClick={onDelete} title="Delete segment"><X size={13}/></button>
    </div>
  </div>;
}

function DeviceInspector({ item, onClose, onInterfaceChange, connectMode, pendingPort, connections, onConnectPort }) {
  if (!item) return null;
  const definition = getDeviceDefinition(item.id);
  const ports = definition?.ports || [];
  const bridgeIds = [...new Set(ports.map(port => port.bridge).filter(Boolean))];

  return <aside className="inspector" onPointerDown={event => event.stopPropagation()}>
    <div className="inspector-header">
      <div><span>Device inspector</span><strong>{item.name}</strong></div>
      <button className="icon-button" onClick={onClose}><X size={16}/></button>
    </div>
    {!definition ? <div className="inspector-empty">Detailed simulation is not available for this device yet.</div> : <>
      <section className="inspector-section">
        <h3>Physical ports <span>{ports.length}</span></h3>
        <div className="port-list">{ports.map(port => {
          const isPending = pendingPort?.deviceId === item.instanceId && pendingPort?.portId === port.id;
          const isConnected = connections.some(connection => [connection.a, connection.b].some(end => end.deviceId === item.instanceId && end.portId === port.id));
          return <div className={`port-row ${isPending ? 'pending' : ''}`} key={port.id}>
          <div className={`port-symbol ${port.kind}`}><EthernetPort size={14}/></div>
          <div><strong>{port.label}</strong><span>{port.kind === 'routed' ? 'Independent routed interface' : port.kind === 'wireless' || port.kind === 'endpoint-wireless' ? 'Wireless · LAN bridge' : port.kind === 'switched' ? 'Switch port · LAN bridge' : 'Endpoint interface'}</span></div>
          {connectMode ? <button className="port-connect" disabled={isConnected} onClick={() => onConnectPort(item.instanceId, port.id)}>{isConnected ? 'Linked' : isPending ? 'Selected' : 'Connect'}</button> : port.bridge && <small>{port.bridge.toUpperCase()}</small>}
        </div>})}</div>
      </section>
      <section className="inspector-section">
        <h3>IP interfaces</h3>
        {[...ports.filter(port => ['routed', 'endpoint', 'endpoint-wireless'].includes(port.kind)).map(port => ({ id: port.id, label: port.label })), ...bridgeIds.map(id => ({ id, label: `${id.toUpperCase()} bridge` }))].map(networkInterface => <div className="interface-config" key={networkInterface.id}>
          <label>{networkInterface.label}</label>
          <div><input aria-label={`${networkInterface.label} IP address`} placeholder="IP address" value={item.interfaces?.[networkInterface.id]?.address || ''} onChange={event => onInterfaceChange(item.instanceId, networkInterface.id, 'address', event.target.value)}/><span>/</span><input aria-label={`${networkInterface.label} prefix`} type="number" min="0" max="32" value={item.interfaces?.[networkInterface.id]?.prefix ?? 24} onChange={event => onInterfaceChange(item.instanceId, networkInterface.id, 'prefix', event.target.value)}/></div>
        </div>)}
        {!ports.some(port => ['routed', 'endpoint', 'endpoint-wireless'].includes(port.kind)) && !bridgeIds.length && <p>No configurable IP interfaces.</p>}
      </section>
      <section className="inspector-section">
        <h3>Enabled capabilities</h3>
        <div className="inspector-capabilities">{featureLabels(definition.capabilities).map(feature => <span key={feature}>✓ {feature}</span>)}</div>
      </section>
    </>}
  </aside>;
}

function PlacedDevice({ item, selected, interactionMode, onConnect, onSelect, onMove, onDelete }) {
  const Icon = item.icon;
  const [dragging, setDragging] = useState(false);
  const offset = useRef({ x: 0, y: 0 });

  function pointerDown(event) {
    event.stopPropagation();
    if (interactionMode === 'connect') {
      onConnect(item.instanceId);
      return;
    }
    onSelect(item.instanceId);
    setDragging(true);
    offset.current = { x: event.clientX - item.x, y: event.clientY - item.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  return <div className={`placed-device ${selected ? 'selected' : ''} ${dragging ? 'dragging' : ''}`} style={{ left: item.x, top: item.y, '--device-color': item.color }}
    onPointerDown={pointerDown}
    onPointerMove={e => { if (dragging) onMove(item.instanceId, Math.max(8, e.clientX - offset.current.x), Math.max(8, e.clientY - offset.current.y)); }}
    onPointerUp={() => setDragging(false)}>
    {selected && <button className="delete-device" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onDelete(); }}><Trash2 size={13}/></button>}
    <div className="placed-icon"><Icon size={29}/><span className="port-light"/></div>
    <span>{item.label}</span>
    <small>{item.ports || item.model}</small>
  </div>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
