/**
 * Invite flow for up to four players, still with no server.
 *
 * The host opens a room and gets one invite per free slot. Each invite is an
 * independent WebRTC connection with its own copy-paste offer, so three friends
 * means three offers and three answers, and each guest only ever pastes their own.
 *
 *   host                                       guest (slot p3)
 *     openLobby({room})                          joinLobby(offerP3)
 *     invite('p2') ... invite('p4')   --offer-->   accepts, answers
 *     answer('p3', answerBlobFromP3)  <--answer--
 *     -> onConnect('p3', peer)  => host.addGuest('p3', peer)
 *
 * The slot name is inside the offer, so a guest cannot be put in the wrong slot by
 * pasting the wrong blob: the answer's slot is checked against the invite it
 * answers, and the room code is checked on every blob.
 *
 * Slot p1 is the host. Guests are p2, p3, p4.
 */

import { Peer } from './transport.js';
import { decodeBlob, randomRoomCode } from './protocol.js';

export const GUEST_SLOTS = Object.freeze(['p2', 'p3', 'p4']);

/**
 * @param {object} options
 * @param {string} [options.room]
 * @param {string[]} [options.slots]         defaults to GUEST_SLOTS
 * @param {(slot:string, peer:Peer)=>void} options.onConnect   guest finished handshake
 * @param {(slot:string, reason?:string)=>void} [options.onDrop]  guest connection closed
 * @param {(error:Error, slot:string)=>void} [options.onError]
 * @param {object} [options.peerOptions]    passed to every Peer (e.g. iceServers)
 */
export async function openLobby(options = {}) {
  const {
    room = randomRoomCode(), slots = GUEST_SLOTS, onConnect, onDrop = () => {},
    onError = () => {}, peerOptions = {},
  } = options;
  if (typeof onConnect !== 'function') throw new TypeError('openLobby needs onConnect(slot, peer)');
  for (const slot of slots) {
    if (!GUEST_SLOTS.includes(slot)) throw new TypeError(`unknown slot ${slot}`);
  }

  const invites = new Map();  // slot -> { slot, peer, offer, answered, connected }

  async function invite(slot) {
    if (!GUEST_SLOTS.includes(slot)) throw new TypeError(`unknown slot ${slot}`);
    const existing = invites.get(slot);
    if (existing && !existing.closed) throw new Error(`slot ${slot} already has an open invite`);
    const peer = new Peer({ role: 'host', room, label: slot, ...peerOptions,
                            onError: error => onError(error, slot) });
    const record = { slot, peer, offer: null, answered: false, connected: false, closed: false };
    invites.set(slot, record);
    record.offer = await peer.createOffer();
    peer.hello.then(() => {
      record.connected = true;
      onConnect(slot, peer);
    }, () => { /* handshake failure surfaces through peer.closed */ });
    peer.closed.then(() => {
      record.closed = true;
      record.connected = false;
      onDrop(slot, 'closed');
    });
    return record.offer;
  }

  async function answer(slot, answerBlob) {
    const record = invites.get(slot);
    if (!record) throw new Error(`no invite for slot ${slot}; create one first`);
    if (record.answered) throw new Error(`slot ${slot} has already been answered`);
    await record.peer.acceptAnswer(answerBlob);
    record.answered = true;
    return record.peer;
  }

  for (const slot of slots) await invite(slot);

  return {
    room,
    invites,
    invite,
    answer,
    /** Current offer for a slot, so a lost blob can be re-shown. */
    offerFor: slot => invites.get(slot)?.offer ?? null,
    connected: () => [...invites.values()].filter(record => record.connected).map(record => record.slot),
    /** Resolves once every connection has actually closed, not merely been asked to. */
    async close() {
      const peers = [...invites.values()].map(record => record.peer);
      for (const peer of peers) {
        try { peer.close(); } catch { /* already closed */ }
      }
      await Promise.race([Promise.all(peers.map(peer => peer.closed)),
                          new Promise(resolve => setTimeout(resolve, 3000))]);
    },
  };
}

/**
 * Guest side: accept an offer and produce the answer to send back.
 * The room comes from the offer itself, so the guest does not type it.
 */
export async function joinLobby(offerBlob, options = {}) {
  const { peerOptions = {}, onError = () => {} } = options;
  const { room, label } = decodeBlob(offerBlob, { expectKind: 'offer' });
  const peer = new Peer({ role: 'guest', room, ...peerOptions, onError });
  const answer = await peer.acceptOffer(offerBlob);
  return { slot: peer.label ?? label, room, peer, answer };
}
