from channels.generic.websocket import AsyncJsonWebsocketConsumer


class SessionFeedConsumer(AsyncJsonWebsocketConsumer):
    """One websocket per monitoring session. Joins a channel-layer group that
    the ws-forwarder worker publishes processed frames into (see
    streaming/management/commands/run_ws_forwarder.py)."""

    async def connect(self):
        self.session_id = self.scope['url_route']['kwargs']['session_id']
        self.group_name = f'session_{self.session_id}'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def frame_message(self, event):
        await self.send_json(event['payload'])


class TargetHistoryConsumer(AsyncJsonWebsocketConsumer):
    """One websocket per tracked target_id, so the Track History page gets
    live updates (a sighting starting/ending) while the person is still
    being watched in the background - see streaming/playback.py, which
    broadcasts to this same group whenever it opens or closes a Sighting."""

    async def connect(self):
        self.target_id = self.scope['url_route']['kwargs']['target_id']
        self.group_name = f'target_history_{self.target_id}'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def sighting_update(self, event):
        await self.send_json(event['payload'])
