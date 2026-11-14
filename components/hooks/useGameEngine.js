import React from 'react';
import { createLocalGameState } from '../../utils/gameLogic.js';
import { gameReducer } from '../../utils/gameReducer.js';

// --- HOOK ---
// Единый редьюсер вынесен в utils/gameReducer.js и переиспользуется сервером
// комнаты (авторитетно) и здесь (для локальной hotseat-игры и приёма снапшотов).
export const useGameEngine = (initialLocalState, isLocalMode, localConfig) => {
    const initialState = React.useMemo(() => {
        if (isLocalMode && initialLocalState) {
            return initialLocalState;
        }
        return null;
    }, [isLocalMode, initialLocalState]);

    const [gameState, dispatch] = React.useReducer(gameReducer, initialState);

    // Ref to hold current state for closures (critical for network callbacks)
    const gameStateRef = React.useRef(gameState);

    // Sync Ref with State
    React.useEffect(() => {
        gameStateRef.current = gameState;
    }, [gameState]);

    return { gameState, dispatch, gameStateRef };
};
