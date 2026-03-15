const post = async (url, body) => {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  try { return { status: r.status, body: JSON.parse(text) }; }
  catch { return { status: r.status, body: text }; }
};

const BASE = 'http://127.0.0.1:9020';

// 1. Create session
const session = await post(`${BASE}/api/session/create`, { player_name: 'SmokeTest' });
console.log('=== SESSION CREATE ===');
console.log(JSON.stringify({ status: session.status, room_code: session.body?.room_code, player_id: session.body?.player_id, ok: !!session.body?.room_code }, null, 2));

if (!session.body?.room_code) { console.error('ABORT: no room_code'); process.exit(1); }

const { room_code, player_id } = session.body;

// 2. Create character
const char = await post(`${BASE}/api/character/create`, {
  room_code, player_id, name: 'Aris', race: 'Human', char_class: 'Fighter',
  abilities: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 10 },
});
console.log('\n=== CHARACTER CREATE ===');
console.log(JSON.stringify({ status: char.status, char_id: char.body?.character?.id, char_name: char.body?.character?.name }, null, 2));

// 3. SESSION_START action → simulates adventure start / what Adventure Log receives
const start = await post(`${BASE}/api/action`, { room_code, player_id, content: '[SESSION_START]' });
console.log('\n=== SESSION_START ACTION (Adventure Log entries) ===');
console.log(JSON.stringify({
  status: start.status,
  narratives: start.body?.narratives ?? [],
  dice_results_count: (start.body?.dice_results ?? []).length,
  dm_generation: start.body?.dm_generation ?? null,
  error: start.body?.error ?? null,
}, null, 2));

// 4. Voice action path: transcript → DM response (what Adventure Log shows after hold-to-talk)
const voiceAction = await post(`${BASE}/api/action`, { room_code, player_id, content: 'I look around the room carefully' });
console.log('\n=== VOICE ACTION (transcript → DM response) ===');
console.log(JSON.stringify({
  status: voiceAction.status,
  narratives: voiceAction.body?.narratives ?? [],
  dice_results_count: (voiceAction.body?.dice_results ?? []).length,
  dm_generation: voiceAction.body?.dm_generation ?? null,
  error: voiceAction.body?.error ?? null,
}, null, 2));
