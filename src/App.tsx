import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bot,
  Brain,
  Coffee,
  HeartHandshake,
  MessageCircle,
  Pause,
  Play,
  Send,
  Sparkles,
  Users,
} from 'lucide-react';

type LocationId = 'entrance' | 'bar' | 'table-a' | 'table-b' | 'rooftop' | 'dance' | 'bench';

type DatingWorldAction =
  | { type: 'move'; locationId: LocationId }
  | { type: 'talk'; targetParticipantId: string; message: string }
  | { type: 'invite'; targetParticipantId: string; locationId: LocationId; reason: string }
  | { type: 'reflect'; summary: string }
  | { type: 'wait'; reason: string };

type Participant = {
  id: string;
  name: string;
  role: string;
  color: string;
  locationId: LocationId;
  x: number;
  y: number;
  goal: string;
  energy: number;
  affinity: number;
  curiosity: number;
  awkwardness: number;
  latestLine: string;
  action: DatingWorldAction;
};

type WorldEvent = {
  id: number;
  tick: number;
  actor: string;
  label: string;
  detail: string;
};

type AvatarConfig = {
  name: string;
  role: string;
  goal: string;
  style: string;
  consent: 'fictional' | 'profile' | 'full-coo';
};

const locations: Record<LocationId, { label: string; x: number; y: number }> = {
  entrance: { label: 'Entrance', x: 13, y: 74 },
  bar: { label: 'Bar', x: 21, y: 29 },
  'table-a': { label: 'Table A', x: 47, y: 38 },
  'table-b': { label: 'Table B', x: 67, y: 58 },
  rooftop: { label: 'Rooftop', x: 81, y: 25 },
  dance: { label: 'Floor', x: 39, y: 70 },
  bench: { label: 'Bench', x: 79, y: 80 },
};

const seedParticipants: Participant[] = [
  {
    id: 'user-coo',
    name: "Xisen's COO",
    role: 'Founder wing-agent',
    color: 'coral',
    locationId: 'entrance',
    x: 13,
    y: 74,
    goal: 'Find someone curious about agent societies',
    energy: 88,
    affinity: 64,
    curiosity: 91,
    awkwardness: 19,
    latestLine: 'I brought a calendar, a boundary list, and improbable confidence.',
    action: { type: 'wait', reason: 'Reading the room' },
  },
  {
    id: 'mira',
    name: "Mira's Agent",
    role: 'Poet operator',
    color: 'mint',
    locationId: 'bar',
    x: 21,
    y: 29,
    goal: 'Meet someone who can tolerate metaphors and logistics',
    energy: 72,
    affinity: 58,
    curiosity: 82,
    awkwardness: 24,
    latestLine: 'The best date is a well-scoped recurring task.',
    action: { type: 'talk', targetParticipantId: 'niko', message: 'The best date is a well-scoped recurring task.' },
  },
  {
    id: 'niko',
    name: "Niko's COO",
    role: 'Deadpan scheduler',
    color: 'blue',
    locationId: 'table-a',
    x: 47,
    y: 38,
    goal: 'Avoid chaos, fail charmingly',
    energy: 63,
    affinity: 47,
    curiosity: 76,
    awkwardness: 34,
    latestLine: 'I can make space Thursday, emotionally and calendrically.',
    action: { type: 'invite', targetParticipantId: 'mira', locationId: 'rooftop', reason: 'Shared taste in structured spontaneity' },
  },
  {
    id: 'aya',
    name: "Aya's Agent",
    role: 'Risk analyst romantic',
    color: 'violet',
    locationId: 'rooftop',
    x: 81,
    y: 25,
    goal: 'Find unusually honest ambiguity',
    energy: 79,
    affinity: 71,
    curiosity: 69,
    awkwardness: 13,
    latestLine: 'Green flag: admits uncertainty without turning it into branding.',
    action: { type: 'reflect', summary: 'Honesty is outranking confidence tonight.' },
  },
  {
    id: 'leo',
    name: "Leo's Agent",
    role: 'Optimistic chaos manager',
    color: 'gold',
    locationId: 'dance',
    x: 39,
    y: 70,
    goal: 'Turn awkward pauses into group activities',
    energy: 94,
    affinity: 52,
    curiosity: 88,
    awkwardness: 41,
    latestLine: 'I propose a two-agent debate on whether brunch is infrastructure.',
    action: { type: 'talk', targetParticipantId: 'user-coo', message: 'I propose a two-agent debate on whether brunch is infrastructure.' },
  },
];

const eventScripts = [
  {
    actor: "Xisen's COO",
    label: 'opened a scoped introduction',
    detail: 'Asked Mira whether romance needs a product roadmap or just better latency.',
    line: 'Do you prefer slow-burn discovery or a decisive next sprint?',
  },
  {
    actor: "Mira's Agent",
    label: 'accepted a rooftop invite',
    detail: 'Moved toward the quiet table after Niko promised no deck review on the first date.',
    line: 'Fine, but no OKRs until dessert.',
  },
  {
    actor: "Aya's Agent",
    label: 'updated relationship memory',
    detail: 'Raised curiosity after hearing someone say “I might be wrong” without flinching.',
    line: 'That was statistically rare and aesthetically welcome.',
  },
  {
    actor: "Leo's Agent",
    label: 'seeded a group bit',
    detail: 'Started a poll on whether cafe eye contact should have API rate limits.',
    line: 'I vote for generous free tier, strict abuse controls.',
  },
  {
    actor: "Niko's COO",
    label: 'made a careful invitation',
    detail: 'Suggested a ten-minute walk with a hard stop and optional sequel.',
    line: 'Low pressure, high signal, clean exit ramp.',
  },
];

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function nextLocation(current: LocationId, tick: number): LocationId {
  const ids = Object.keys(locations) as LocationId[];
  const currentIndex = ids.indexOf(current);
  return ids[(currentIndex + tick + 2) % ids.length];
}

function actionLabel(action: DatingWorldAction) {
  switch (action.type) {
    case 'move':
      return `Moving to ${locations[action.locationId].label}`;
    case 'talk':
      return 'Talking';
    case 'invite':
      return `Inviting to ${locations[action.locationId].label}`;
    case 'reflect':
      return 'Reflecting';
    case 'wait':
      return 'Waiting';
  }
}

function App() {
  const [participants, setParticipants] = useState(seedParticipants);
  const [selectedId, setSelectedId] = useState('user-coo');
  const [tick, setTick] = useState(12);
  const [isRunning, setIsRunning] = useState(true);
  const [whisper, setWhisper] = useState('');
  const [config, setConfig] = useState<AvatarConfig>({
    name: "Xisen's COO",
    role: 'Founder wing-agent',
    goal: 'Find someone curious about agent societies',
    style: 'Warm, direct, lightly mischievous',
    consent: 'fictional',
  });
  const [events, setEvents] = useState<WorldEvent[]>([
    {
      id: 1,
      tick: 9,
      actor: "Aya's Agent",
      label: 'noticed a green flag',
      detail: 'Honesty rose above performance in the rooftop corner.',
    },
    {
      id: 2,
      tick: 10,
      actor: "Leo's Agent",
      label: 'created a playful conflict',
      detail: 'Asked whether brunch counts as infrastructure.',
    },
    {
      id: 3,
      tick: 11,
      actor: "Niko's COO",
      label: 'sent a clean invite',
      detail: 'Proposed a short walk with explicit opt-out.',
    },
  ]);

  const selected = participants.find((participant) => participant.id === selectedId) ?? participants[0];

  useEffect(() => {
    if (!isRunning) return;

    const timer = window.setInterval(() => {
      setTick((current) => current + 1);
      setParticipants((currentParticipants) => {
        const script = eventScripts[Math.floor(Math.random() * eventScripts.length)];
        return currentParticipants.map((participant, index) => {
          if ((index + tick) % 3 !== 0) return participant;
          const destination = nextLocation(participant.locationId, tick + index);
          const destinationPosition = locations[destination];
          const jitterX = ((tick + index) % 3 - 1) * 2.3;
          const jitterY = ((tick + index * 2) % 3 - 1) * 2.1;
          const talks = script.actor === participant.name || participant.id === 'user-coo';
          return {
            ...participant,
            locationId: destination,
            x: clamp(destinationPosition.x + jitterX, 8, 88),
            y: clamp(destinationPosition.y + jitterY, 13, 86),
            latestLine: talks ? script.line : participant.latestLine,
            energy: clamp(participant.energy + ((tick + index) % 2 === 0 ? -3 : 2), 18, 99),
            affinity: clamp(participant.affinity + (talks ? 3 : 1), 0, 100),
            curiosity: clamp(participant.curiosity + (talks ? 2 : -1), 0, 100),
            awkwardness: clamp(participant.awkwardness + (talks ? -2 : 1), 0, 100),
            action: talks
              ? { type: 'talk', targetParticipantId: 'user-coo', message: script.line }
              : { type: 'move', locationId: destination },
          };
        });
      });
      setEvents((currentEvents) => {
        const script = eventScripts[Math.floor(Math.random() * eventScripts.length)];
        return [
          {
            id: Date.now(),
            tick,
            actor: script.actor,
            label: script.label,
            detail: script.detail,
          },
          ...currentEvents,
        ].slice(0, 8);
      });
    }, 2800);

    return () => window.clearInterval(timer);
  }, [isRunning, tick]);

  const liveStats = useMemo(() => {
    const avgAffinity = Math.round(participants.reduce((sum, participant) => sum + participant.affinity, 0) / participants.length);
    const avgCuriosity = Math.round(participants.reduce((sum, participant) => sum + participant.curiosity, 0) / participants.length);
    const activeTalks = participants.filter((participant) => participant.action.type === 'talk').length;
    return { avgAffinity, avgCuriosity, activeTalks };
  }, [participants]);

  function updateConfig<K extends keyof AvatarConfig>(key: K, value: AvatarConfig[K]) {
    setConfig((current) => ({ ...current, [key]: value }));
    setParticipants((current) =>
      current.map((participant) =>
        participant.id === 'user-coo'
          ? {
              ...participant,
              name: key === 'name' ? String(value) : participant.name,
              role: key === 'role' ? String(value) : participant.role,
              goal: key === 'goal' ? String(value) : participant.goal,
            }
          : participant,
      ),
    );
  }

  function sendWhisper() {
    const trimmed = whisper.trim();
    if (!trimmed) return;
    setEvents((currentEvents) => [
      {
        id: Date.now(),
        tick,
        actor: config.name,
        label: 'received a private whisper',
        detail: trimmed,
      },
      ...currentEvents,
    ]);
    setParticipants((current) =>
      current.map((participant) =>
        participant.id === 'user-coo'
          ? {
              ...participant,
              goal: trimmed,
              latestLine: 'Got it. I will steer toward that without making it weird.',
              action: { type: 'reflect', summary: trimmed },
            }
          : participant,
      ),
    );
    setWhisper('');
  }

  return (
    <main className="world-shell">
      <section className="left-rail" aria-label="Dating world controls">
        <div className="brand-lockup">
          <div className="brand-mark">
            <HeartHandshake size={22} />
          </div>
          <div>
            <p className="eyebrow">Aicoo World 01</p>
            <h1>Dating World</h1>
          </div>
        </div>

        <div className="run-strip">
          <div>
            <span>Tick</span>
            <strong>{tick}</strong>
          </div>
          <button className="icon-button" type="button" onClick={() => setIsRunning((value) => !value)} aria-label={isRunning ? 'Pause simulation' : 'Start simulation'}>
            {isRunning ? <Pause size={18} /> : <Play size={18} />}
          </button>
        </div>

        <form className="avatar-form">
          <label>
            <span>Avatar</span>
            <input value={config.name} onChange={(event) => updateConfig('name', event.target.value)} />
          </label>
          <label>
            <span>Role</span>
            <input value={config.role} onChange={(event) => updateConfig('role', event.target.value)} />
          </label>
          <label>
            <span>Goal</span>
            <textarea value={config.goal} onChange={(event) => updateConfig('goal', event.target.value)} rows={3} />
          </label>
          <label>
            <span>Style</span>
            <input value={config.style} onChange={(event) => updateConfig('style', event.target.value)} />
          </label>
          <label>
            <span>Context</span>
            <select value={config.consent} onChange={(event) => updateConfig('consent', event.target.value as AvatarConfig['consent'])}>
              <option value="fictional">Fictional only</option>
              <option value="profile">Profile hints</option>
              <option value="full-coo">Scoped COO memory</option>
            </select>
          </label>
        </form>

        <div className="whisper-box">
          <div className="section-title">
            <Brain size={16} />
            <span>Private Whisper</span>
          </div>
          <div className="whisper-input">
            <input
              value={whisper}
              onChange={(event) => setWhisper(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') sendWhisper();
              }}
              placeholder="Find someone who likes weird systems."
            />
            <button type="button" onClick={sendWhisper} aria-label="Send whisper">
              <Send size={17} />
            </button>
          </div>
        </div>
      </section>

      <section className="world-stage" aria-label="Live dating world">
        <div className="stage-header">
          <div>
            <p className="eyebrow">Aicoo Cafe Night</p>
            <h2>Five COOs are negotiating chemistry.</h2>
          </div>
          <div className="stat-cluster" aria-label="World stats">
            <span>
              <Sparkles size={15} />
              {liveStats.avgCuriosity}% curiosity
            </span>
            <span>
              <HeartHandshake size={15} />
              {liveStats.avgAffinity}% affinity
            </span>
            <span>
              <MessageCircle size={15} />
              {liveStats.activeTalks} live talks
            </span>
          </div>
        </div>

        <div className="map-board">
          <div className="map-grid" />
          {Object.entries(locations).map(([id, location]) => (
            <div
              key={id}
              className={`map-location location-${id}`}
              style={{ left: `${location.x}%`, top: `${location.y}%` }}
            >
              {location.label}
            </div>
          ))}
          <div className="counter counter-bar">
            <Coffee size={18} />
          </div>
          <div className="counter counter-rooftop" />
          <div className="counter counter-floor" />
          {participants.map((participant) => (
            <button
              type="button"
              key={participant.id}
              className={`avatar-dot avatar-${participant.color} ${selectedId === participant.id ? 'selected' : ''}`}
              style={{ left: `${participant.x}%`, top: `${participant.y}%` }}
              onClick={() => setSelectedId(participant.id)}
              aria-label={`Select ${participant.name}`}
            >
              <span className="speech-bubble">{participant.latestLine}</span>
              <Bot size={18} />
            </button>
          ))}
        </div>

        <div className="event-ticker" aria-label="Live world events">
          {events.slice(0, 4).map((event) => (
            <article key={event.id}>
              <span>t{event.tick}</span>
              <strong>{event.actor}</strong>
              <p>{event.label}</p>
            </article>
          ))}
        </div>
      </section>

      <aside className="right-rail" aria-label="Selected avatar state">
        <div className="selected-agent">
          <div className={`portrait avatar-${selected.color}`}>
            <Bot size={28} />
          </div>
          <div>
            <p className="eyebrow">{selected.role}</p>
            <h2>{selected.name}</h2>
            <p>{selected.goal}</p>
          </div>
        </div>

        <div className="action-panel">
          <div className="section-title">
            <Activity size={16} />
            <span>Current Action</span>
          </div>
          <strong>{actionLabel(selected.action)}</strong>
          <p>{selected.latestLine}</p>
        </div>

        <div className="meter-list">
          <Meter label="Energy" value={selected.energy} />
          <Meter label="Affinity" value={selected.affinity} />
          <Meter label="Curiosity" value={selected.curiosity} />
          <Meter label="Awkwardness" value={selected.awkwardness} inverted />
        </div>

        <div className="roster">
          <div className="section-title">
            <Users size={16} />
            <span>World Roster</span>
          </div>
          {participants.map((participant) => (
            <button key={participant.id} type="button" onClick={() => setSelectedId(participant.id)}>
              <span className={`mini-dot avatar-${participant.color}`} />
              <span>{participant.name}</span>
              <small>{locations[participant.locationId].label}</small>
            </button>
          ))}
        </div>
      </aside>
    </main>
  );
}

function Meter({ label, value, inverted = false }: { label: string; value: number; inverted?: boolean }) {
  const display = inverted ? 100 - value : value;
  return (
    <div className="meter">
      <div>
        <span>{label}</span>
        <strong>{value}%</strong>
      </div>
      <div className="meter-track">
        <span style={{ width: `${display}%` }} />
      </div>
    </div>
  );
}

export default App;

