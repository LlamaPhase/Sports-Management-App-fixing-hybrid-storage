import React, { useState, useContext } from 'react'; // Added useContext
    import { Download, Trash2, X, Loader2 } from 'lucide-react'; // Added Loader2
    import { SavedLineup, TeamContext } from '../context/TeamContext'; // Import TeamContext

    interface LoadLineupModalProps {
      isOpen: boolean;
      onClose: () => void;
      savedLineups: SavedLineup[];
      onLoad: (name: string) => void;
      onDelete: (name: string) => Promise<void>; // Make onDelete async
    }

    const LoadLineupModal: React.FC<LoadLineupModalProps> = ({ isOpen, onClose, savedLineups, onLoad, onDelete }) => {
      const { savedLineupsLoading } = useContext(TeamContext); // Get loading state
      const [selectedLineup, setSelectedLineup] = useState<string | null>(null);
      const [deletingName, setDeletingName] = useState<string | null>(null); // Track which lineup is being deleted

      const handleLoad = () => {
        if (selectedLineup) {
          onLoad(selectedLineup);
          onClose();
        } else {
          alert('Please select a lineup to load.');
        }
      };

      const handleDelete = async (e: React.MouseEvent, name: string) => {
        e.stopPropagation();
        if (window.confirm(`Are you sure you want to delete the lineup "${name}"?`)) {
          setDeletingName(name); // Indicate deletion start
          try {
            await onDelete(name); // Call async delete
            if (selectedLineup === name) {
              setSelectedLineup(null);
            }
          } catch (error) {
            // Error already alerted in context
          } finally {
            setDeletingName(null); // Indicate deletion end
          }
        }
      };

      if (!isOpen) return null;

      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Load Lineup</h2>
              <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>
            <div className="space-y-4 max-h-60 overflow-y-auto mb-4 pr-2">
              {savedLineupsLoading ? (
                 <div className="flex justify-center items-center py-4">
                    <Loader2 className="animate-spin text-red-600" size={24} />
                    <span className="ml-2 text-gray-500">Loading lineups...</span>
                 </div>
              ) : savedLineups.length === 0 ? (
                <p className="text-gray-500 text-center">No saved lineups found.</p>
              ) : (
                savedLineups.map((lineup) => (
                  <div
                    key={lineup.name}
                    onClick={() => setSelectedLineup(lineup.name)}
                    className={`flex justify-between items-center p-3 border rounded-md cursor-pointer transition-colors ${
                      selectedLineup === lineup.name
                        ? 'bg-red-100 border-red-300'
                        : 'hover:bg-gray-100 border-gray-200'
                    }`}
                  >
                    <span className="font-medium">{lineup.name}</span>
                    <button
                      onClick={(e) => handleDelete(e, lineup.name)}
                      disabled={deletingName === lineup.name} // Disable button while deleting this specific lineup
                      className="text-gray-400 hover:text-red-600 transition-colors p-1 -mr-1 disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label={`Delete lineup ${lineup.name}`}
                    >
                      {deletingName === lineup.name ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="flex justify-end space-x-3 pt-4 border-t">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLoad}
                disabled={!selectedLineup || savedLineups.length === 0 || savedLineupsLoading} // Disable if loading
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition flex items-center space-x-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={18} />
                <span>Load</span>
              </button>
            </div>
          </div>
        </div>
      );
    };

    export default LoadLineupModal;
