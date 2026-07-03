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
