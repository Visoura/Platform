import { ScrollArea } from './ui/scroll-area';
import { User } from 'lucide-react';

export interface DetectedPerson {
  targetId: string;
  cameraId: number;
  lastSeen: string;
  isVisible: boolean;
}

interface DetectedPersonsSidebarProps {
  persons: DetectedPerson[];
  onPersonSelect: (person: DetectedPerson) => void;
}

export function DetectedPersonsSidebar({
  persons,
  onPersonSelect,
}: DetectedPersonsSidebarProps) {
  // Limit to 10 persons max
  const visiblePersons = persons.slice(0, 10);

  return (
    <div className="bg-[#161B2A] rounded-xl border border-[#3B82F6]/20 h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#3B82F6]/15 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-sm text-[#E5E7EB]" style={{ fontWeight: 600 }}>
            Detected Persons
          </h2>
          <span className="text-[10px] text-[#3B82F6] bg-[#3B82F6]/10 px-2 py-0.5 rounded-full">
            {visiblePersons.length}
            {persons.length > 10 && `/${persons.length}`}
          </span>
        </div>
        <p className="text-[10px] text-[#475569] mt-0.5">Click to view details</p>
      </div>

      {/* List */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2.5 space-y-2">
          {visiblePersons.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-12 h-12 rounded-full bg-[#0B0F19] border border-[#3B82F6]/20 flex items-center justify-center">
                <User className="w-5 h-5 text-[#3B82F6]/40" />
              </div>
              <p className="text-[11px] text-[#475569] text-center">
                No persons detected yet
              </p>
            </div>
          ) : (
            visiblePersons.map((person) => (
              <button
                key={person.targetId}
                onClick={() => onPersonSelect(person)}
                className="w-full bg-[#0D1220] hover:bg-[#0B0F19] border border-[#3B82F6]/10 hover:border-[#3B82F6]/40 rounded-lg p-3 transition-all hover:shadow-[0_0_14px_rgba(59,130,246,0.18)] text-left group"
              >
                <div className="flex items-center gap-3">
                  {/* Thumbnail */}
                  <div className="w-10 h-12 bg-[#020617] rounded-lg flex items-center justify-center border border-[#22C55E]/60 flex-shrink-0 relative overflow-hidden group-hover:border-[#22C55E] transition-colors">
                    {/* Silhouette */}
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="w-3.5 h-3.5 rounded-full border-[1.5px] border-[#22C55E]/80"></div>
                      <div className="w-4 h-5 border-[1.5px] border-[#22C55E]/80 rounded-t-full"></div>
                    </div>
                    {/* Detection glow */}
                    <div className="absolute inset-0 bg-[#22C55E]/5 group-hover:bg-[#22C55E]/10 transition-colors" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-[#E5E7EB] truncate" style={{ fontWeight: 500 }}>
                      Person #{person.targetId.slice(0, 8)}
                    </div>
                    <div className="text-[10px] text-[#475569] mt-0.5 truncate">
                      Camera {person.cameraId}
                    </div>
                    <div className="text-[10px] text-[#475569] truncate">
                      {person.lastSeen}
                    </div>
                  </div>

                  {/* Status dot */}
                  <div className="flex flex-col items-center gap-1 flex-shrink-0">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        person.isVisible
                          ? 'bg-[#22C55E] shadow-[0_0_6px_rgba(34,197,94,0.7)]'
                          : 'bg-[#475569]'
                      }`}
                    />
                    {person.isVisible && (
                      <span className="text-[8px] text-[#22C55E] uppercase tracking-wide">
                        Live
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}

          {/* Overflow notice */}
          {persons.length > 10 && (
            <div className="text-center py-2">
              <span className="text-[10px] text-[#475569]">
                +{persons.length - 10} more not shown
              </span>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
