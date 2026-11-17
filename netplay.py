"""Servidor de netplay local (substitui o servidor oficial do EmulatorJS).

Ele só apresenta os aparelhos uns aos outros: guarda as salas e repassa as
mensagens de sinalização do WebRTC. O vídeo do jogo e os comandos dos
controles vão direto entre os aparelhos, pela rede local.

Protocolo compatível com o EmulatorJS 4.3 (data/src/netplay.js):
  open-room, join-room, leave-room, webrtc-signal, data-message
  GET /list?game_id=...
"""
import threading

from flask import jsonify, request, session
from flask_socketio import emit, join_room, leave_room

rooms = {}        # session_id -> sala
sockets = {}      # socket sid -> (session_id, player_id)
lock = threading.Lock()


def _public_room(session_id, room):
    owner = next((p for p in room["players"].values() if p["socketId"] == room["owner"]), None)
    return {
        "room_name": room["room_name"],
        "current": len(room["players"]),
        "max": room["max_players"],
        "player_name": owner.get("player_name", "?") if owner else "?",
        "hasPassword": bool(room["password"]),
        "game_id": room["game_id"],
    }


def list_rooms(game_id=None):
    with lock:
        return {
            sid: _public_room(sid, room)
            for sid, room in rooms.items()
            if len(room["players"]) < room["max_players"]
            and (game_id is None or str(room["game_id"]) == str(game_id))
        }


def register_netplay(app, socketio):

    @app.get("/list")
    def netplay_list():
        return jsonify(list_rooms(request.args.get("game_id")))

    def _leave(sid, socketio_emit):
        """Remove o jogador da sala; usado por leave-room e disconnect."""
        with lock:
            info = sockets.pop(sid, None)
            if not info:
                return None
            session_id, player_id = info
            room = rooms.get(session_id)
            if not room:
                return session_id
            room["players"].pop(player_id, None)
            if not room["players"]:
                del rooms[session_id]
                return session_id
            if room["owner"] == sid:
                # quem criou saiu: passa a sala para o próximo da lista
                room["owner"] = next(iter(room["players"].values()))["socketId"]
            players = dict(room["players"])
        socketio_emit("users-updated", players, to=session_id)
        return session_id

    # só quem está logado neste app entra nas salas (a origem já é conferida no app.py)
    @socketio.on("connect")
    def conectou(*_):
        if not session.get("jogador_id"):
            return False

    @socketio.on("open-room")
    def open_room(data):
        extra = (data or {}).get("extra") or {}
        session_id = extra.get("sessionid")
        player_id = extra.get("userid") or extra.get("playerId")
        if not session_id or not player_id:
            return "Invalid data: sessionId and playerId required"
        with lock:
            if session_id in rooms:
                return "Room already exists"
            rooms[session_id] = {
                "owner": request.sid,
                "players": {player_id: {**extra, "socketId": request.sid}},
                "room_name": extra.get("room_name") or f"Sala {session_id[:6]}",
                "game_id": extra.get("game_id", "default"),
                "password": data.get("password") or None,
                "max_players": int(data.get("maxPlayers") or 4),
            }
            sockets[request.sid] = (session_id, player_id)
            players = dict(rooms[session_id]["players"])
        join_room(session_id)
        emit("users-updated", players, to=session_id)
        return None

    @socketio.on("join-room")
    def join(data):
        extra = (data or {}).get("extra") or {}
        session_id = extra.get("sessionid")
        player_id = extra.get("userid")
        if not session_id or not player_id:
            return "Invalid data: sessionId and playerId required"
        with lock:
            room = rooms.get(session_id)
            if not room:
                return "Room not found"
            if room["password"] and room["password"] != (data.get("password") or None):
                return "Incorrect password"
            if len(room["players"]) >= room["max_players"]:
                return "Room full"
            room["players"][player_id] = {**extra, "socketId": request.sid}
            sockets[request.sid] = (session_id, player_id)
            players = dict(room["players"])
        join_room(session_id)
        emit("users-updated", players, to=session_id)
        return None, players

    @socketio.on("leave-room")
    def leave():
        session_id = _leave(request.sid, socketio.emit)
        if session_id:
            leave_room(session_id)

    @socketio.on("disconnect")
    def disconnect(*_):
        _leave(request.sid, socketio.emit)

    @socketio.on("webrtc-signal")
    def webrtc_signal(data):
        data = data or {}
        target = data.get("target")
        if not target:
            return
        if data.get("requestRenegotiate"):
            payload = {"sender": request.sid, "requestRenegotiate": True}
        else:
            payload = {
                "sender": request.sid,
                "candidate": data.get("candidate"),
                "offer": data.get("offer"),
                "answer": data.get("answer"),
            }
        emit("webrtc-signal", payload, to=target)

    def _relay(event):
        def handler(data):
            info = sockets.get(request.sid)
            if info:
                emit(event, data, to=info[0], include_self=False)
        handler.__name__ = f"relay_{event.replace('-', '_')}"
        socketio.on(event)(handler)

    for event in ("data-message", "snapshot", "input"):
        _relay(event)
