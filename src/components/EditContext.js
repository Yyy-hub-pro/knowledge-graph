import React, { createContext, useContext, useReducer, useCallback } from 'react';

// 编辑操作类型
export const EDIT_ACTIONS = {
  ENTER_EDIT_MODE: 'ENTER_EDIT_MODE',
  EXIT_EDIT_MODE: 'EXIT_EDIT_MODE',
  SELECT_NODE: 'SELECT_NODE',
  DESELECT_ALL: 'DESELECT_ALL',
  DELETE_NODE: 'DELETE_NODE',
  ADD_NODE: 'ADD_NODE',
  UPDATE_NODE: 'UPDATE_NODE',
  ADD_LINK: 'ADD_LINK',
  DELETE_LINK: 'DELETE_LINK',
  UPDATE_LINK: 'UPDATE_LINK',
  UNDO: 'UNDO',
  REDO: 'REDO',
  SAVE_STATE: 'SAVE_STATE',
  RESTORE_BACKUP: 'RESTORE_BACKUP'
};

// 初始编辑状态
const initialEditState = {
  isEditMode: false,
  selectedNodes: [],
  data: {
    nodes: [],
    links: []
  },
  backup: null,
  history: [],
  historyIndex: -1,
  hasUnsavedChanges: false,
  dragState: {
    isDragging: false,
    sourceNode: null,
    targetNode: null,
    previewPath: null
  }
};

// 深拷贝工具函数
const deepClone = (obj) => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  if (typeof obj === 'object') {
    const copy = {};
    Object.keys(obj).forEach(key => {
      copy[key] = deepClone(obj[key]);
    });
    return copy;
  }
};

// 历史管理工具
const addToHistory = (state, newData) => {
  const maxHistorySize = 50;
  const newHistory = [...state.history];
  
  // 如果不是最新位置，清除后续历史
  if (state.historyIndex < newHistory.length - 1) {
    newHistory.splice(state.historyIndex + 1);
  }
  
  // 添加当前状态到历史
  newHistory.push(deepClone(state.data));
  
  // 限制历史大小
  if (newHistory.length > maxHistorySize) {
    newHistory.shift();
  }
  
  return {
    ...state,
    data: newData,
    history: newHistory,
    historyIndex: newHistory.length - 1,
    hasUnsavedChanges: true
  };
};

// 生成唯一ID
const generateNodeId = (layer, existingNodes) => {
  const layerPrefixes = {
    1: 'ind_edit_',
    2: 'job_edit_',
    3: 'skill_edit_',
    4: 'know_edit_'
  };
  
  const prefix = layerPrefixes[layer] || 'node_edit_';
  const existingIds = existingNodes.map(n => n.id);
  let counter = 1;
  
  while (existingIds.includes(`${prefix}${counter.toString().padStart(3, '0')}`)) {
    counter++;
  }
  
  return `${prefix}${counter.toString().padStart(3, '0')}`;
};

// 编辑状态Reducer
const editReducer = (state, action) => {
  switch (action.type) {
    case EDIT_ACTIONS.ENTER_EDIT_MODE:
      return {
        ...state,
        isEditMode: true,
        backup: deepClone(action.data),
        data: deepClone(action.data),
        selectedNodes: [],
        hasUnsavedChanges: false,
        history: [],
        historyIndex: -1
      };

    case EDIT_ACTIONS.EXIT_EDIT_MODE:
      return {
        ...initialEditState,
        data: action.saveChanges ? state.data : (state.backup || state.data)
      };

    case EDIT_ACTIONS.SELECT_NODE:
      const isSelected = state.selectedNodes.includes(action.nodeId);
      return {
        ...state,
        selectedNodes: isSelected 
          ? state.selectedNodes.filter(id => id !== action.nodeId)
          : [...state.selectedNodes, action.nodeId]
      };

    case EDIT_ACTIONS.DESELECT_ALL:
      return {
        ...state,
        selectedNodes: []
      };

    case EDIT_ACTIONS.DELETE_NODE:
      const nodeIdToDelete = action.nodeId;
      const newNodes = state.data.nodes.filter(n => n.id !== nodeIdToDelete);
      const newLinks = state.data.links.filter(l => 
        l.source !== nodeIdToDelete && l.target !== nodeIdToDelete
      );
      
      return addToHistory(state, {
        nodes: newNodes,
        links: newLinks
      });

    case EDIT_ACTIONS.ADD_NODE:
      const newNode = {
        id: action.node.id || generateNodeId(action.node.layer, state.data.nodes),
        ...action.node,
        x: action.node.x || Math.random() * 800 + 100,
        y: action.node.y || Math.random() * 600 + 100
      };
      
      return addToHistory(state, {
        ...state.data,
        nodes: [...state.data.nodes, newNode]
      });

    case EDIT_ACTIONS.UPDATE_NODE:
      const updatedNodes = state.data.nodes.map(node =>
        node.id === action.nodeId ? { ...node, ...action.updates } : node
      );
      
      return addToHistory(state, {
        ...state.data,
        nodes: updatedNodes
      });

    case EDIT_ACTIONS.ADD_LINK:
      const newLink = {
        id: action.link.id || `${action.link.source}-${action.link.target}`,
        source: action.link.source,
        target: action.link.target,
        relationship_type: action.link.relationship_type || 'custom',
        strength: action.link.strength || 0.5,
        evidence_detail: action.link.evidence_detail || '用户自定义关系',
        ...action.link
      };
      
      return addToHistory(state, {
        ...state.data,
        links: [...state.data.links, newLink]
      });

    case EDIT_ACTIONS.DELETE_LINK:
      const filteredLinks = state.data.links.filter(l => l.id !== action.linkId);
      
      return addToHistory(state, {
        ...state.data,
        links: filteredLinks
      });

    case EDIT_ACTIONS.UPDATE_LINK:
      const updatedLinks = state.data.links.map(link =>
        link.id === action.linkId ? { ...link, ...action.updates } : link
      );
      
      return addToHistory(state, {
        ...state.data,
        links: updatedLinks
      });

    case EDIT_ACTIONS.UNDO:
      if (state.historyIndex > 0) {
        return {
          ...state,
          data: deepClone(state.history[state.historyIndex - 1]),
          historyIndex: state.historyIndex - 1,
          hasUnsavedChanges: true
        };
      }
      return state;

    case EDIT_ACTIONS.REDO:
      if (state.historyIndex < state.history.length - 1) {
        return {
          ...state,
          data: deepClone(state.history[state.historyIndex + 1]),
          historyIndex: state.historyIndex + 1,
          hasUnsavedChanges: true
        };
      }
      return state;

    case EDIT_ACTIONS.SAVE_STATE:
      return {
        ...state,
        hasUnsavedChanges: false,
        backup: deepClone(state.data)
      };

    case EDIT_ACTIONS.RESTORE_BACKUP:
      return {
        ...state,
        data: deepClone(state.backup),
        hasUnsavedChanges: false,
        selectedNodes: []
      };

    default:
      return state;
  }
};

// 创建编辑上下文
const EditContext = createContext();

// 编辑上下文Provider
export const EditProvider = ({ children, initialData }) => {
  const [editState, dispatch] = useReducer(editReducer, {
    ...initialEditState,
    data: initialData || { nodes: [], links: [] }
  });

  // 编辑操作方法
  const editActions = {
    enterEditMode: useCallback((data) => {
      dispatch({ type: EDIT_ACTIONS.ENTER_EDIT_MODE, data });
    }, []),

    exitEditMode: useCallback((saveChanges = false) => {
      dispatch({ type: EDIT_ACTIONS.EXIT_EDIT_MODE, saveChanges });
    }, []),

    selectNode: useCallback((nodeId) => {
      dispatch({ type: EDIT_ACTIONS.SELECT_NODE, nodeId });
    }, []),

    deselectAll: useCallback(() => {
      dispatch({ type: EDIT_ACTIONS.DESELECT_ALL });
    }, []),

    deleteNode: useCallback((nodeId) => {
      dispatch({ type: EDIT_ACTIONS.DELETE_NODE, nodeId });
    }, []),

    addNode: useCallback((node) => {
      dispatch({ type: EDIT_ACTIONS.ADD_NODE, node });
    }, []),

    updateNode: useCallback((nodeId, updates) => {
      dispatch({ type: EDIT_ACTIONS.UPDATE_NODE, nodeId, updates });
    }, []),

    addLink: useCallback((link) => {
      dispatch({ type: EDIT_ACTIONS.ADD_LINK, link });
    }, []),

    deleteLink: useCallback((linkId) => {
      dispatch({ type: EDIT_ACTIONS.DELETE_LINK, linkId });
    }, []),

    updateLink: useCallback((linkId, updates) => {
      dispatch({ type: EDIT_ACTIONS.UPDATE_LINK, linkId, updates });
    }, []),

    undo: useCallback(() => {
      dispatch({ type: EDIT_ACTIONS.UNDO });
    }, []),

    redo: useCallback(() => {
      dispatch({ type: EDIT_ACTIONS.REDO });
    }, []),

    saveState: useCallback(() => {
      dispatch({ type: EDIT_ACTIONS.SAVE_STATE });
    }, []),

    restoreBackup: useCallback(() => {
      dispatch({ type: EDIT_ACTIONS.RESTORE_BACKUP });
    }, [])
  };

  const value = {
    editState,
    ...editActions
  };

  return (
    <EditContext.Provider value={value}>
      {children}
    </EditContext.Provider>
  );
};

// 自定义Hook使用编辑上下文
export const useEdit = () => {
  const context = useContext(EditContext);
  if (!context) {
    throw new Error('useEdit must be used within an EditProvider');
  }
  return context;
};

export default EditContext; 