import { motion } from 'motion/react';
import { X, Play } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';

interface Notification {
  personId: number;
  cameraId: number;
  timestamp: string;
}

interface NotificationsPanelProps {
  notifications: Notification[];
  onNotificationClick: (notification: Notification) => void;
  onClose: () => void;
}

export function NotificationsPanel({ notifications, onNotificationClick, onClose }: NotificationsPanelProps) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        onClick={onClose}
      />
      
      <motion.div
        initial={{ opacity: 0, x: 300 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 300 }}
        className="fixed top-16 right-4 bottom-4 w-96 bg-[#161B2A] border border-[#3B82F6]/30 rounded-lg shadow-[0_0_30px_rgba(59,130,246,0.3)] z-50 flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#3B82F6]/20">
          <div>
            <h3 className="text-lg font-semibold text-[#E5E7EB]">Notifications</h3>
            <p className="text-xs text-[#94A3B8] mt-0.5">Search results & alerts</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#3B82F6]/20 rounded transition-colors"
          >
            <X className="w-4 h-4 text-[#94A3B8]" />
          </button>
        </div>

        {/* Notifications List */}
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-3">
            {notifications.length === 0 ? (
              <div className="text-center py-12 text-[#94A3B8] text-sm">
                <div className="w-16 h-16 mx-auto mb-3 bg-[#0B0F19] rounded-full flex items-center justify-center">
                  <Play className="w-8 h-8 text-[#3B82F6]" />
                </div>
                No notifications yet
              </div>
            ) : (
              notifications.map((notification, index) => (
                <div
                  key={index}
                  className="bg-[#0B0F19] border border-[#3B82F6]/20 rounded-lg overflow-hidden hover:border-[#3B82F6]/40 transition-all group"
                >
                  {/* Video Preview */}
                  <div className="relative aspect-video bg-[#020617] flex items-center justify-center">
                    <div className="w-12 h-16 border-2 border-[#22C55E] rounded-t-full"></div>
                    <button
                      onClick={() => onNotificationClick(notification)}
                      className="absolute inset-0 bg-black/0 hover:bg-black/20 flex items-center justify-center group transition-colors"
                    >
                      <div className="w-10 h-10 bg-[#3B82F6] rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Play className="w-5 h-5 text-white ml-0.5" />
                      </div>
                    </button>
                  </div>

                  {/* Details */}
                  <div className="p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-[#E5E7EB]">Match Found</span>
                      <span className="text-[10px] text-[#94A3B8]">{notification.timestamp}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[#94A3B8]">Person ID:</span>
                      <span className="text-[#E5E7EB]">#{notification.personId}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[#94A3B8]">Camera:</span>
                      <span className="text-[#E5E7EB]">Camera {notification.cameraId}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </motion.div>
    </>
  );
}
