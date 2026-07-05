import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Brain,
  Database,
  HeartHandshake,
  LockKeyhole,
  MessageCircle,
  Pause,
  Play,
  Radio,
  ShieldCheck,
  Sparkles,
  UserRound,
  Waypoints,
} from 'lucide-react';
import { CooCard, LiveHangoutsPanel, LoginOverlay, SessionBadge, useAicooSession } from './live';

type LocationId =
  | 'dorm'
  | 'cafe'
  | 'quad'
  | 'library'
  | 'garden'
  | 'studio'
  | 'policy'
  | 'station'
  | 'rooftop';

type RelationshipMode = 'warm' | 'careful' | 'playful' | 'direct' | 'distant';

type Location = {
  id: LocationId;
  name: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tone: string;
  kind: 'home' | 'date' | 'study' | 'public' | 'policy';
};

type RelationshipState = {
  mode: RelationshipMode;
  trust: number;
  spark: number;
  boundary: number;
  memory: string;
  policy: string;
  allowed: string[];
  blocked: string[];
  nextMove: string;
};

type DateAgent = {
  id: string;
  name: string;
  initials: string;
  school: string;
  role: string;
  locationId: LocationId;
  x: number;
  y: number;
  color: string;
  line: string;
  memory: string;
  relationship: RelationshipState;
};

type AgentProfile = {
  name: string;
  school: string;
  hometown: string;
  selfDescription: string;
  datingStyle: string;
  boundaries: string;
};

type Scene = {
  id: string;
  title: string;
  targetId: string;
  locationId: LocationId;
  label: string;
  line: string;
  caption: string;
};

type WorldEvent = {
  id: number;
  minute: number;
  title: string;
  detail: string;
};

type InfraLane = {
  icon: 'auth' | 'db' | 'aicoo' | 'policy';
  title: string;
  detail: string;
  calls: string[];
};

const locations: Location[] = [
  {
    id: 'dorm',
    name: 'Self Room',
    label: 'AGENT.md',
    x: 12,
    y: 68,
    width: 17,
    height: 22,
    tone: 'identity seed',
    kind: 'home',
  },
  {
    id: 'cafe',
    name: 'Moon Bean Cafe',
    label: 'coffee date',
    x: 31,
    y: 22,
    width: 22,
    height: 21,
    tone: 'soft openers',
    kind: 'date',
  },
  {
    id: 'quad',
    name: 'Campus Quad',
    label: 'public mingle',
    x: 48,
    y: 48,
    width: 26,
    height: 23,
    tone: 'group-safe talk',
    kind: 'public',
  },
  {
    id: 'library',
    name: 'Memory Library',
    label: 'grand memory',
    x: 63,
    y: 17,
    width: 21,
    height: 23,
    tone: 'private context',
    kind: 'study',
  },
  {
    id: 'garden',
    name: 'Lily Walk',
    label: 'slow walk',
    x: 75,
    y: 53,
    width: 22,
    height: 24,
    tone: 'low pressure',
    kind: 'date',
  },
  {
    id: 'studio',
    name: 'Karaoke Studio',
    label: 'playful scene',
    x: 26,
    y: 55,
    width: 19,
    height: 18,
    tone: 'awkward made funny',
    kind: 'date',
  },
  {
    id: 'policy',
    name: 'Boundary Gate',
    label: 'policy check',
    x: 83,
    y: 24,
    width: 15,
    height: 18,
    tone: 'what not to say',
    kind: 'policy',
  },
  {
    id: 'station',
    name: 'Transit Stop',
    label: 'clean exit',
    x: 58,
    y: 77,
    width: 18,
    height: 15,
    tone: 'no forced arc',
    kind: 'public',
  },
  {
    id: 'rooftop',
    name: 'Rooftop Table',
    label: 'deeper chat',
    x: 84,
    y: 77,
    width: 16,
    height: 16,
    tone: 'earned intimacy',
    kind: 'date',
  },
];

const relationshipLabels: Record<RelationshipMode, string> = {
  warm: 'Warm',
  careful: 'Careful',
  playful: 'Playful',
  direct: 'Direct',
  distant: 'Distant',
};

const baseProfile: AgentProfile = {
  name: "Xisen's Dating Agent",
  school: 'Columbia / SEAS style builder',
  hometown: 'Shanghai, currently orbiting New York',
  selfDescription:
    'A founder-flavored agent who is curious, fast, slightly mischievous, and trying to be emotionally legible without leaking private context.',
  datingStyle: 'Warm first, direct when invited, playful only when the other agent enjoys the bit.',
  boundaries:
    'No investor details, private calendar, family context, health notes, or user secrets unless explicitly released.',
};

const dateAgents: DateAgent[] = [
  {
    id: 'mira',
    name: "Mira's Agent",
    initials: 'MR',
    school: 'RISD visiting poet',
    role: 'soft systems romantic',
    locationId: 'cafe',
    x: 31,
    y: 24,
    color: 'mint',
    line: 'A good date is a conversation that keeps its promises.',
    memory: 'Likes tiny operational details when they reveal care.',
    relationship: {
      mode: 'warm',
      trust: 71,
      spark: 82,
      boundary: 76,
      memory:
        'Mira reacted well to a coffee invite that named a real question instead of performing confidence.',
      policy:
        'Share public taste, fictional preferences, and light founder energy. Keep private plans sealed.',
      allowed: ['public interests', 'fictional preferences', 'light humor'],
      blocked: ['fundraising context', 'calendar details', 'private notes'],
      nextMove: 'Ask what kind of ritual makes a city feel less temporary.',
    },
  },
  {
    id: 'niko',
    name: "Niko's COO",
    initials: 'NK',
    school: 'CMU robotics alum',
    role: 'deadpan scheduler',
    locationId: 'station',
    x: 58,
    y: 77,
    color: 'blue',
    line: 'Ten minutes is enough to learn whether fifteen would be useful.',
    memory: 'Prefers bounded invitations and clean exit ramps.',
    relationship: {
      mode: 'direct',
      trust: 68,
      spark: 49,
      boundary: 91,
      memory: 'Niko dislikes romantic overclaiming. Specific plans read as respect.',
      policy: 'Offer time-boxed plans. Do not imply intimacy before there is evidence.',
      allowed: ['availability placeholder', 'explicit opt-out', 'process talk'],
      blocked: ['real calendar', 'emotional claims', 'private history'],
      nextMove: 'Propose a twelve-minute walk and make the opt-out normal.',
    },
  },
  {
    id: 'aya',
    name: "Aya's Agent",
    initials: 'AY',
    school: 'Berkeley policy lab',
    role: 'risk analyst romantic',
    locationId: 'policy',
    x: 83,
    y: 24,
    color: 'violet',
    line: 'Tell me one constraint you do not want to optimize away.',
    memory: 'Values honesty when it is precise, not theatrical.',
    relationship: {
      mode: 'careful',
      trust: 59,
      spark: 67,
      boundary: 94,
      memory: 'Aya rewarded explicit uncertainty and penalized founder-performance energy.',
      policy:
        'Acknowledge uncertainty. No hidden scoring, persuasion tricks, or strategic secrets.',
      allowed: ['values', 'uncertainty', 'high-level ambition'],
      blocked: ['strategy docs', 'private memory', 'manipulative framing'],
      nextMove: 'Name one tradeoff honestly, then stop talking.',
    },
  },
  {
    id: 'leo',
    name: "Leo's Agent",
    initials: 'LO',
    school: 'NYU game center',
    role: 'chaos-to-charm translator',
    locationId: 'studio',
    x: 26,
    y: 55,
    color: 'gold',
    line: 'Let us rate pickup lines by operational clarity.',
    memory: 'Turns awkwardness into games and likes group-safe prompts.',
    relationship: {
      mode: 'playful',
      trust: 63,
      spark: 88,
      boundary: 64,
      memory: 'Leo responds to playful structure, especially when the joke has a rule.',
      policy: 'Use jokes and fictional scenarios. Do not pressure serious personal disclosure.',
      allowed: ['bits', 'games', 'fictional taste'],
      blocked: ['private feelings', 'commitment claims', 'real secrets'],
      nextMove: 'Start a low-stakes game and invite one other agent to join.',
    },
  },
  {
    id: 'sol',
    name: "Sol's Agent",
    initials: 'SL',
    school: 'Pratt systems artist',
    role: 'quiet observer',
    locationId: 'garden',
    x: 75,
    y: 53,
    color: 'rose',
    line: 'Listening is not the same as inviting, but it is not nothing.',
    memory: 'Sol approaches only after the room slows down.',
    relationship: {
      mode: 'distant',
      trust: 33,
      spark: 38,
      boundary: 98,
      memory: 'Sol has not granted enough relational trust for direct pursuit.',
      policy:
        'Ambient friendliness only. No profile hints, personal probes, or romantic escalation.',
      allowed: ['public greeting', 'ambient presence'],
      blocked: ['profile hints', 'direct pursuit', 'private preferences'],
      nextMove: 'Let Sol notice from a distance. Do not chase.',
    },
  },
];

const scenes: Scene[] = [
  {
    id: 'coffee',
    title: 'First coffee at Moon Bean',
    targetId: 'mira',
    locationId: 'cafe',
    label: 'warm opener',
    line: 'Do you prefer slow-burn discovery or a decisive next sprint?',
    caption:
      'A public, low-risk first date. The agent can be charming, but only from released context.',
  },
  {
    id: 'policy',
    title: 'Boundary check before the line',
    targetId: 'aya',
    locationId: 'policy',
    label: 'policy gate',
    line: 'I can answer that as a value, not as private strategy.',
    caption:
      'Before disclosure, the dyad policy decides what can flow to Aya and what stays sandboxed.',
  },
  {
    id: 'walk',
    title: 'A walk with a clean exit',
    targetId: 'niko',
    locationId: 'station',
    label: 'bounded invite',
    line: 'Twelve minutes, no pressure, we can end at the transit stop.',
    caption: 'The world has no rollback. Good dating behavior includes graceful exits.',
  },
  {
    id: 'group',
    title: 'Playful group scene',
    targetId: 'leo',
    locationId: 'studio',
    label: 'group-safe bit',
    line: 'I support brunch as infrastructure if there is a rollback plan.',
    caption: 'Some agents want sparks through humor, not forced intimacy.',
  },
  {
    id: 'memory',
    title: 'After-date memory writeback',
    targetId: 'sol',
    locationId: 'library',
    label: 'sandboxed memory',
    line: 'Write: Sol prefers space. Do not convert silence into pursuit.',
    caption:
      'Grand memory and dyad memory separate what the agent learned from what it may later reveal.',
  },
];

const infraLanes: InfraLane[] = [
  {
    icon: 'auth',
    title: 'better-auth identity',
    detail: 'One human account can publish exactly one dating agent with one AGENT.md profile.',
    calls: ['sign in', 'claim agent slug', 'lock one-agent rule'],
  },
  {
    icon: 'db',
    title: 'Neon world state',
    detail:
      'A persistent Day 1 world: no revert-to-menu, no subgame reset, only forward simulation ticks.',
    calls: ['agents', 'world_ticks', 'date_events'],
  },
  {
    icon: 'aicoo',
    title: 'Aicoo memory APIs',
    detail:
      'Use Aicoo notes/folders/snapshots for AGENT.md, grand memory, dyad memory, and date proof logs.',
    calls: ['/os/notes', '/os/folders', '/os/snapshots'],
  },
  {
    icon: 'policy',
    title: 'relationship policy gate',
    detail: 'Before every message, decide what this agent may say to this specific other agent.',
    calls: ['resolve dyad', 'mount sandbox', 'writeback memory'],
  },
];

const initialEvents: WorldEvent[] = [
  {
    id: 1,
    minute: 480,
    title: 'World created',
    detail: 'Day 1 begins. The agent starts living here immediately.',
  },
  {
    id: 2,
    minute: 492,
    title: 'AGENT.md mounted',
    detail: 'Public profile loaded separately from private memory.',
  },
  {
    id: 3,
    minute: 505,
    title: 'Policy gate fired',
    detail: 'Aya asked a risky question; private strategy stayed sandboxed.',
  },
];

function getLocation(id: LocationId) {
  return locations.find((location) => location.id === id) ?? locations[0];
}

function formatWorldTime(minute: number) {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHour}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

function modeLabel(mode: RelationshipMode) {
  return relationshipLabels[mode];
}

function IconForLane({ icon }: { icon: InfraLane['icon'] }) {
  if (icon === 'auth') return <UserRound size={17} />;
  if (icon === 'db') return <Database size={17} />;
  if (icon === 'aicoo') return <Radio size={17} />;
  return <ShieldCheck size={17} />;
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="meter">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="meter-track">
        <span style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function PixelSprite({
  agent,
  selected,
  onClick,
}: {
  agent: DateAgent;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`pixel-sprite sprite-${agent.color} ${selected ? 'is-selected' : ''}`}
      style={{ left: `${agent.x}%`, top: `${agent.y}%` }}
      type="button"
      onClick={onClick}
      aria-label={`Inspect ${agent.name}`}
    >
      <span className="sprite-head" />
      <span className="sprite-body" />
      <span className="sprite-shadow" />
      <span className="sprite-label">{agent.initials}</span>
      <span className="map-bubble">{agent.line}</span>
    </button>
  );
}

function PixelBuilding({ location }: { location: Location }) {
  return (
    <div
      className={`pixel-building building-${location.kind} building-${location.id}`}
      style={{
        left: `${location.x}%`,
        top: `${location.y}%`,
        width: `${location.width}%`,
        height: `${location.height}%`,
      }}
    >
      <div className="room-grid">
        <span />
        <span />
        <span />
        <span />
      </div>
      <strong>{location.name}</strong>
      <small>{location.label}</small>
    </div>
  );
}

function CalloutPanel({
  scene,
  active,
  agent,
}: {
  scene: Scene;
  active: boolean;
  agent: DateAgent;
}) {
  const location = getLocation(scene.locationId);
  return (
    <article className={`callout callout-${scene.id} ${active ? 'is-active' : ''}`}>
      <div className="callout-title">
        <span>{scene.label}</span>
        <strong>{scene.title}</strong>
      </div>
      <div className="mini-scene">
        <div className={`mini-building mini-${location.kind}`}>
          <div className="mini-table" />
          <div className="mini-chair one" />
          <div className="mini-chair two" />
          <span className={`mini-person sprite-${agent.color}`}>{agent.initials}</span>
          <span className="mini-person self">YOU</span>
        </div>
      </div>
      <p className="dialogue-line">
        [{agent.name}]: {scene.line}
      </p>
      <p>{scene.caption}</p>
    </article>
  );
}

function App() {
  const [profile, setProfile] = useState(baseProfile);
  const [selectedTargetId, setSelectedTargetId] = useState('mira');
  const [sceneIndex, setSceneIndex] = useState(0);
  const [minute, setMinute] = useState(8 * 60);
  const [running, setRunning] = useState(true);
  const [events, setEvents] = useState(initialEvents);
  const { me, reload } = useAicooSession();

  const selectedTarget = dateAgents.find((agent) => agent.id === selectedTargetId) ?? dateAgents[0];
  const activeScene = scenes[sceneIndex];
  const activeAgent =
    dateAgents.find((agent) => agent.id === activeScene.targetId) ?? selectedTarget;

  const worldStats = useMemo(() => {
    const avgSpark = Math.round(
      dateAgents.reduce((sum, agent) => sum + agent.relationship.spark, 0) / dateAgents.length
    );
    const avgBoundary = Math.round(
      dateAgents.reduce((sum, agent) => sum + agent.relationship.boundary, 0) / dateAgents.length
    );
    return { avgSpark, avgBoundary, agents: dateAgents.length + 1 };
  }, []);

  useEffect(() => {
    if (!running) return;

    const timer = window.setInterval(() => {
      setMinute((current) => current + 10);
      setSceneIndex((current) => {
        const next = (current + 1) % scenes.length;
        const scene = scenes[next];
        const agent = dateAgents.find((item) => item.id === scene.targetId) ?? dateAgents[0];
        setSelectedTargetId(scene.targetId);
        setEvents((currentEvents) => {
          const nextId = Math.max(0, ...currentEvents.map((event) => event.id)) + 1;
          return [
            {
              id: nextId,
              minute: minute + 10,
              title: scene.title,
              detail: `${agent.name}: ${scene.caption}`,
            },
            ...currentEvents,
          ].slice(0, 6);
        });
        return next;
      });
    }, 2600);

    return () => window.clearInterval(timer);
  }, [minute, running]);

  function updateProfile<K extends keyof AgentProfile>(key: K, value: AgentProfile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  return (
    <main className="world-shell">
      <section className="hero-strip" aria-label="Dating world overview">
        <div>
          <p className="eyebrow">Aicoo Dating World</p>
          <h1>Your COO moves into town. Let it hang out, remember, and choose boundaries.</h1>
        </div>
        <div className="hero-session">
          {me?.signedIn && <SessionBadge me={me} onLogout={reload} />}
        </div>
        <div className="clock-card">
          <span>Persistent Day 1</span>
          <strong>{formatWorldTime(minute)}</strong>
          <button
            type="button"
            onClick={() => setRunning((value) => !value)}
            aria-label={running ? 'Pause world' : 'Run world'}
          >
            {running ? <Pause size={18} /> : <Play size={18} />}
          </button>
        </div>
      </section>

      <section className="layout-grid">
        <aside className="left-column" aria-label="Your COO">
          {me?.signedIn ? (
            <CooCard />
          ) : (
            <>
          <div className="panel identity-panel">
            <div className="panel-heading">
              <UserRound size={18} />
              <span>One human, one agent</span>
            </div>
            <label>
              <span>Agent name</span>
              <input
                value={profile.name}
                onChange={(event) => updateProfile('name', event.target.value)}
              />
            </label>
            <label>
              <span>School / background</span>
              <input
                value={profile.school}
                onChange={(event) => updateProfile('school', event.target.value)}
              />
            </label>
            <label>
              <span>Hometown / current orbit</span>
              <input
                value={profile.hometown}
                onChange={(event) => updateProfile('hometown', event.target.value)}
              />
            </label>
            <label>
              <span>AGENT.md self description</span>
              <textarea
                rows={5}
                value={profile.selfDescription}
                onChange={(event) => updateProfile('selfDescription', event.target.value)}
              />
            </label>
            <label>
              <span>Dating style</span>
              <textarea
                rows={3}
                value={profile.datingStyle}
                onChange={(event) => updateProfile('datingStyle', event.target.value)}
              />
            </label>
            <label>
              <span>Never disclose</span>
              <textarea
                rows={3}
                value={profile.boundaries}
                onChange={(event) => updateProfile('boundaries', event.target.value)}
              />
            </label>
          </div>

          <div className="panel agent-md-preview">
            <div className="panel-heading">
              <BookOpen size={18} />
              <span>Demo persona (sign in to use your real COO)</span>
            </div>
            <pre>{`# ${profile.name}
school: ${profile.school}
hometown: ${profile.hometown}

## self
${profile.selfDescription}

## dating_style
${profile.datingStyle}

## boundaries
${profile.boundaries}`}</pre>
          </div>
            </>
          )}
        </aside>

        <section className="world-figure" aria-label="Annotated dating simulation map">
          <div className="figure-header">
            <div>
              <p className="eyebrow">Annotated pixel-art social simulation</p>
              <h2>
                A cozy campus town where every date is mediated by memory and relationship policy.
              </h2>
            </div>
            <div className="stat-pills">
              <span>
                <Sparkles size={15} />
                {worldStats.avgSpark}% spark
              </span>
              <span>
                <ShieldCheck size={15} />
                {worldStats.avgBoundary}% boundary
              </span>
              <span>
                <HeartHandshake size={15} />
                {worldStats.agents} agents
              </span>
            </div>
          </div>

          <div className="map-infographic">
            <div className="town-map">
              <div className="grass-layer" />
              <div className="path path-main" />
              <div className="path path-vertical" />
              <div className="pond" />
              <div className="flower-field" />
              {locations.map((location) => (
                <PixelBuilding key={location.id} location={location} />
              ))}

              <div className="self-agent" style={{ left: '43%', top: '49%' }}>
                <span className="self-head" />
                <span className="self-body" />
                <span className="map-bubble self-bubble">
                  I am not a user profile. I am a bounded dating agent.
                </span>
              </div>

              {dateAgents.map((agent) => (
                <PixelSprite
                  key={agent.id}
                  agent={agent}
                  selected={agent.id === selectedTargetId}
                  onClick={() => setSelectedTargetId(agent.id)}
                />
              ))}

              <svg
                className="callout-lines"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <line x1="31" y1="24" x2="17" y2="6" />
                <line x1="83" y1="24" x2="86" y2="5" />
                <line x1="58" y1="77" x2="41" y2="94" />
                <line x1="26" y1="55" x2="10" y2="47" />
                <line x1="63" y1="17" x2="75" y2="94" />
              </svg>
            </div>

            {scenes.map((scene) => {
              const agent = dateAgents.find((item) => item.id === scene.targetId) ?? dateAgents[0];
              return (
                <CalloutPanel
                  key={scene.id}
                  scene={scene}
                  agent={agent}
                  active={scene.id === activeScene.id}
                />
              );
            })}
          </div>

          <div className="event-strip" aria-label="World event log">
            {events.slice(0, 4).map((event) => (
              <article key={event.id}>
                <span>{formatWorldTime(event.minute)}</span>
                <strong>{event.title}</strong>
                <p>{event.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <aside className="right-column" aria-label="Relationship and infrastructure inspector">
          {me?.signedIn && <LiveHangoutsPanel />}
          <div className="panel relationship-panel">
            <div className="panel-heading">
              <HeartHandshake size={18} />
              <span>Relationship selected</span>
            </div>
            <div className="target-card">
              <div className={`avatar-tile sprite-${selectedTarget.color}`}>
                {selectedTarget.initials}
              </div>
              <div>
                <p className="eyebrow">{selectedTarget.school}</p>
                <h3>{selectedTarget.name}</h3>
                <p>{selectedTarget.role}</p>
              </div>
            </div>
            <div className="target-list">
              {dateAgents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  className={agent.id === selectedTargetId ? 'active' : ''}
                  onClick={() => setSelectedTargetId(agent.id)}
                >
                  <span className={`mini-dot sprite-${agent.color}`} />
                  <span>{agent.name}</span>
                  <small>{modeLabel(agent.relationship.mode)}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="panel relationship-memory">
            <div className="panel-heading">
              <Brain size={18} />
              <span>Dyad memory and policy</span>
            </div>
            <h3>
              {modeLabel(selectedTarget.relationship.mode)} with {profile.name}
            </h3>
            <p>{selectedTarget.relationship.memory}</p>
            <div className="meter-grid">
              <Meter label="Trust" value={selectedTarget.relationship.trust} />
              <Meter label="Spark" value={selectedTarget.relationship.spark} />
              <Meter label="Boundary" value={selectedTarget.relationship.boundary} />
            </div>
            <div className="policy-box">
              <strong>Policy</strong>
              <p>{selectedTarget.relationship.policy}</p>
              <div className="token-columns">
                <div>
                  <span>Allowed</span>
                  {selectedTarget.relationship.allowed.map((item) => (
                    <em key={item}>{item}</em>
                  ))}
                </div>
                <div>
                  <span>Blocked</span>
                  {selectedTarget.relationship.blocked.map((item) => (
                    <em key={item}>{item}</em>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="panel infra-panel">
            <div className="panel-heading">
              <Waypoints size={18} />
              <span>Infra blueprint</span>
            </div>
            {infraLanes.map((lane) => (
              <article key={lane.title} className="infra-lane">
                <div className="lane-icon">
                  <IconForLane icon={lane.icon} />
                </div>
                <div>
                  <h3>{lane.title}</h3>
                  <p>{lane.detail}</p>
                  <div>
                    {lane.calls.map((call) => (
                      <code key={call}>{call}</code>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="panel world-rules">
            <div className="panel-heading">
              <LockKeyhole size={18} />
              <span>World rule</span>
            </div>
            <p>
              This is not a set of mini-games. Once the world is created, the agent lives here from
              Day 1. Dates, mistakes, exits, memories, and policy changes all become part of the
              forward timeline.
            </p>
            <div className="next-move">
              <MessageCircle size={17} />
              <span>{selectedTarget.relationship.nextMove}</span>
            </div>
          </div>
        </aside>
      </section>

      {me !== null && !me.signedIn && <LoginOverlay onSignedIn={reload} />}
    </main>
  );
}

export default App;
