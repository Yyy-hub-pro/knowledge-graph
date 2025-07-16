import React, { useState, useCallback } from 'react';
import { 
  Edit3, 
  Save, 
  X, 
  Undo, 
  Redo, 
  Trash2, 
  Download,
  AlertTriangle,
  GripVertical,
  Minimize2,
  Maximize2,
  Sparkles
} from 'lucide-react';
import { useEdit } from './EditContext';
import { cleanGraphData, analyzeSymbolUsage } from '../utils/dataUtils';

const EditToolbar = ({ onDataChange, currentGraphData }) => {
  const {
    editState,
    enterEditMode,
    exitEditMode,
    undo,
    redo,
    saveState,
    restoreBackup,
    deselectAll,
    deleteNode,
    updateNode
  } = useEdit();

  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCleanConfirm, setShowCleanConfirm] = useState(false);
  const [cleaningStats, setCleaningStats] = useState(null);
  
  // 🔥 新增：拖拽和折叠状态
  const [position, setPosition] = useState({ x: 0, y: 60 }); // 初始位置会在useEffect中设置
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isCollapsed, setIsCollapsed] = useState(false);

  // 🔥 拖拽处理函数
  const handleMouseDown = useCallback((e) => {
    if (e.target.closest('.drag-handle')) {
      const rect = e.currentTarget.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
      setIsDragging(true);
      e.preventDefault();
    }
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    
    const newX = e.clientX - dragOffset.x;
    const newY = e.clientY - dragOffset.y;
    
    // 限制在视窗范围内
    const maxX = window.innerWidth - 200; // 工具栏最小宽度
    const maxY = window.innerHeight - 100; // 工具栏最小高度
    
    setPosition({
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY))
    });
  }, [isDragging, dragOffset]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // 监听全局鼠标事件
  React.useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // 🔥 初始化位置和响应式处理
  React.useEffect(() => {
    const updatePosition = () => {
      setPosition(prev => ({
        x: Math.min(prev.x, window.innerWidth - 200),
        y: Math.min(prev.y, window.innerHeight - 100)
      }));
    };

    // 设置初始位置
    if (position.x === 0) {
      setPosition({ x: window.innerWidth - 220, y: 60 });
    }

    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [position.x]);

  // 进入编辑模式 - 🔥 使用当前图谱数据作为起点
  const handleEnterEditMode = () => {
    enterEditMode(currentGraphData || editState.data);
  };

  // 退出编辑模式
  const handleExitEditMode = (saveChanges = false) => {
    if (editState.hasUnsavedChanges && !showExitConfirm && !saveChanges) {
      setShowExitConfirm(true);
      return;
    }

    exitEditMode(saveChanges);
    setShowExitConfirm(false);
    deselectAll();
    
    // 通知父组件数据变化
    if (onDataChange && saveChanges) {
      onDataChange(editState.data);
    }
  };

  // 保存编辑
  const handleSave = useCallback(() => {
    saveState();
    if (onDataChange) {
      onDataChange(editState.data);
    }
  }, [saveState, onDataChange, editState.data]);

  // 删除选中节点
  const handleDeleteNodes = useCallback(() => {
    if (editState.selectedNodes.length === 0) return;
    
    if (editState.selectedNodes.length === 1) {
      setShowDeleteConfirm(true);
    } else {
      // 批量删除确认
      setShowDeleteConfirm(true);
    }
  }, [editState.selectedNodes.length]);

  // 🔥 确认删除函数
  const confirmDelete = useCallback(() => {
    editState.selectedNodes.forEach(nodeId => {
      deleteNode(nodeId);
    });
    setShowDeleteConfirm(false);
    deselectAll();
  }, [editState.selectedNodes, deleteNode, deselectAll]);

  // 🔥 导出编辑数据
  const handleExport = useCallback(() => {
    const dataBlob = new Blob([JSON.stringify(editState.data, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(dataBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `knowledge-graph-edited-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [editState.data]);

  // 🔥 数据清理功能
  const handleCleanData = useCallback(() => {
    // 分析当前数据中的特殊符号
    const stats = analyzeSymbolUsage(editState.data.nodes);
    setCleaningStats(stats);
    
    if (stats.withSymbols > 0) {
      setShowCleanConfirm(true);
    } else {
      alert('数据中没有发现需要清理的特殊符号！');
    }
  }, [editState.data.nodes]);

  // 🔥 确认清理数据
  const confirmCleanData = useCallback(() => {
    const cleanedData = cleanGraphData(editState.data);
    
    // 🔥 通过编辑上下文更新数据
    // 批量更新所有需要清理的节点
    let cleanedCount = 0;
    cleanedData.nodes.forEach(cleanedNode => {
      const originalNode = editState.data.nodes.find(n => n.id === cleanedNode.id);
      if (originalNode && (originalNode.name !== cleanedNode.name || originalNode.description !== cleanedNode.description)) {
        // 只更新名称和描述字段
        const updates = {};
        if (originalNode.name !== cleanedNode.name) {
          updates.name = cleanedNode.name;
        }
        if (originalNode.description !== cleanedNode.description) {
          updates.description = cleanedNode.description;
        }
        
        if (Object.keys(updates).length > 0) {
          updateNode(cleanedNode.id, updates);
          cleanedCount++;
        }
      }
    });
    
    setShowCleanConfirm(false);
    setCleaningStats(null);
    
    console.log('🧹 数据清理完成，共清理了', cleanedCount, '个节点');
    
    // 显示清理结果
    if (cleanedCount > 0) {
      setTimeout(() => {
        alert(`数据清理完成！共清理了 ${cleanedCount} 个节点的特殊符号。`);
      }, 100);
    }
  }, [editState.data, updateNode]);

  // 键盘快捷键
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if (!editState.isEditMode) return;

      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'z':
            e.preventDefault();
            if (e.shiftKey) {
              redo();
            } else {
              undo();
            }
            break;
          case 'y':
            e.preventDefault();
            redo();
            break;
          case 's':
            e.preventDefault();
            handleSave();
            break;
          case 'Escape':
            e.preventDefault();
            deselectAll();
            break;
          default:
            // 其他按键不处理
            break;
        }
      } else if (e.key === 'Delete' && editState.selectedNodes.length > 0) {
        e.preventDefault();
        handleDeleteNodes();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editState.isEditMode, editState.selectedNodes, undo, redo, deselectAll, handleDeleteNodes, handleSave]);

  // 如果不在编辑模式，显示进入编辑按钮
  if (!editState.isEditMode) {
    return (
      <div 
        className="fixed z-50"
        style={{ 
          right: '16px',
          top: `${position.y}px`
        }}
      >
        <button
          onClick={handleEnterEditMode}
          className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg 
                     shadow-lg transition-all duration-200 flex items-center gap-2 text-sm"
        >
          <Edit3 size={16} />
          进入编辑
        </button>
      </div>
    );
  }

  // 🔥 可拖拽的紧凑编辑工具栏
  return (
    <>
      <div 
        className={`fixed z-50 transition-all duration-200 ${isDragging ? 'cursor-grabbing' : ''}`}
        style={{ 
          left: `${position.x}px`, 
          top: `${position.y}px`,
          transform: isDragging ? 'scale(1.02)' : 'scale(1)'
        }}
        onMouseDown={handleMouseDown}
      >
        <div className={`bg-white/95 backdrop-blur-sm rounded-lg shadow-xl border border-gray-200/50 
                        transition-all duration-200 ${isDragging ? 'shadow-2xl' : ''}`}>
          
          {/* 🔥 工具栏头部：拖拽手柄 + 折叠按钮 */}
          <div className="flex items-center justify-between px-2 py-1 border-b border-gray-200/50">
            <div className="drag-handle flex items-center gap-1 cursor-grab hover:cursor-grab active:cursor-grabbing">
              <GripVertical size={12} className="text-gray-400" />
              <span className="text-xs text-gray-600 font-medium select-none">编辑工具</span>
            </div>
            
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1 rounded hover:bg-gray-100 transition-colors"
              title={isCollapsed ? "展开工具栏" : "折叠工具栏"}
            >
              {isCollapsed ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
            </button>
          </div>

          {/* 🔥 工具栏内容（可折叠） */}
          {!isCollapsed && (
            <>
              {/* 主要工具按钮 */}
              <div className="flex items-center gap-0.5 p-1">
                {/* 撤销/重做 */}
                <div className="flex items-center gap-0.5 border-r border-gray-200 pr-1">
                  <button
                    onClick={undo}
                    disabled={editState.historyIndex <= 0}
                    className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed
                              transition-colors"
                    title="撤销 (Ctrl+Z)"
                  >
                    <Undo size={14} />
                  </button>
                  
                  <button
                    onClick={redo}
                    disabled={editState.historyIndex >= editState.history.length - 1}
                    className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed
                              transition-colors"
                    title="重做 (Ctrl+Y)"
                  >
                    <Redo size={14} />
                  </button>
                </div>

                {/* 删除 */}
                <div className="flex items-center gap-0.5 border-r border-gray-200 pr-1">
                  <button
                    onClick={handleDeleteNodes}
                    disabled={editState.selectedNodes.length === 0}
                    className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed
                              text-red-600 transition-colors"
                    title={`删除选中节点 (Delete) ${editState.selectedNodes.length > 0 ? `(${editState.selectedNodes.length}个)` : ''}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* 保存 */}
                <div className="flex items-center gap-0.5 border-r border-gray-200 pr-1">
                  <button
                    onClick={handleSave}
                    disabled={!editState.hasUnsavedChanges}
                    className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed
                              text-green-600 transition-colors"
                    title="保存 (Ctrl+S)"
                  >
                    <Save size={14} />
                  </button>
                </div>

                {/* 导出 */}
                <div className="flex items-center gap-0.5 border-r border-gray-200 pr-1">
                  <button
                    onClick={handleExport}
                    className="p-1.5 rounded hover:bg-gray-100 transition-colors"
                    title="导出数据"
                  >
                    <Download size={14} />
                  </button>
                </div>

                {/* 🔥 数据清理 */}
                <div className="flex items-center gap-0.5 border-r border-gray-200 pr-1">
                  <button
                    onClick={handleCleanData}
                    className="p-1.5 rounded hover:bg-gray-100 transition-colors text-purple-600"
                    title="清理节点名称中的特殊符号"
                  >
                    <Sparkles size={14} />
                  </button>
                </div>

                {/* 退出编辑 */}
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => handleExitEditMode(true)}
                    className="p-1.5 rounded hover:bg-gray-100 text-green-600 transition-colors"
                    title="保存并退出"
                  >
                    <Save size={14} />
                  </button>
                  
                  <button
                    onClick={() => handleExitEditMode(false)}
                    className="p-1.5 rounded hover:bg-gray-100 text-red-600 transition-colors"
                    title="取消编辑"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* 🔥 状态指示器（紧凑版） */}
              <div className="px-2 py-1 border-t border-gray-200/50 bg-gray-50/50">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600">
                    {editState.selectedNodes.length > 0 && (
                      <span className="text-blue-600">
                        选中 {editState.selectedNodes.length} 个
                      </span>
                    )}
                  </span>
                  
                  <div className="flex items-center space-x-2">
                    {editState.hasUnsavedChanges && (
                      <span className="text-orange-600 flex items-center gap-1">
                        <AlertTriangle size={10} />
                        未保存
                      </span>
                    )}
                    
                    {/* 数据持久化状态指示 */}
                    {(() => {
                      const hasLocalEdits = localStorage.getItem('knowledge-graph-edits') !== null;
                      return hasLocalEdits && !editState.hasUnsavedChanges && (
                        <span className="text-green-600 flex items-center gap-1">
                          <Save size={10} />
                          已保存
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 退出确认对话框 */}
      {showExitConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="text-orange-500" size={24} />
              <h3 className="text-lg font-semibold">确认退出编辑</h3>
            </div>
            
            <p className="text-gray-600 mb-6">
              您有未保存的更改。您希望：
            </p>
            
            <div className="flex gap-3">
              <button
                onClick={() => handleExitEditMode(true)}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded-lg
                          transition-colors"
              >
                保存并退出
              </button>
              
              <button
                onClick={() => {
                  restoreBackup();
                  handleExitEditMode(false);
                }}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded-lg
                          transition-colors"
              >
                放弃更改
              </button>
              
              <button
                onClick={() => setShowExitConfirm(false)}
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 px-4 rounded-lg
                          transition-colors"
              >
                继续编辑
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认对话框 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <Trash2 className="text-red-500" size={24} />
              <h3 className="text-lg font-semibold">确认删除节点</h3>
            </div>
            
            <p className="text-gray-600 mb-6">
              {editState.selectedNodes.length === 1 
                ? '您确定要删除选中的节点吗？'
                : `您确定要删除选中的 ${editState.selectedNodes.length} 个节点吗？`
              }
              <br />
              <span className="text-red-600 text-sm">
                删除节点将同时删除与其相关的所有连线，此操作可以撤销。
              </span>
            </p>
            
            <div className="flex gap-3">
              <button
                onClick={confirmDelete}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded-lg
                          transition-colors"
              >
                确认删除
              </button>
              
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 px-4 rounded-lg
                          transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🔥 数据清理确认对话框 */}
      {showCleanConfirm && cleaningStats && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <Sparkles className="text-purple-500" size={24} />
              <h3 className="text-lg font-semibold">数据清理确认</h3>
            </div>
            
            <div className="text-gray-600 mb-6">
              <p className="mb-3">
                检测到节点名称中包含特殊符号，建议进行清理：
              </p>
              
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>总节点数: <span className="font-semibold">{cleaningStats.total}</span></div>
                  <div>包含符号: <span className="font-semibold text-orange-600">{cleaningStats.withSymbols}</span></div>
                </div>
                
                <div className="mt-3 space-y-1">
                  {Object.entries(cleaningStats.byLayer).map(([layer, stats]) => 
                    stats.withSymbols > 0 && (
                      <div key={layer} className="flex justify-between text-xs">
                        <span>第{layer}层:</span>
                        <span className="text-orange-600">{stats.withSymbols}/{stats.total}</span>
                      </div>
                    )
                  )}
                </div>
              </div>
              
              <p className="mt-3 text-sm text-gray-500">
                清理操作将移除节点名称中的 %@...@% 和 ##@...@## 等标记符号。
              </p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={confirmCleanData}
                className="flex-1 bg-purple-500 hover:bg-purple-600 text-white py-2 px-4 rounded-lg
                          transition-colors flex items-center justify-center gap-2"
              >
                <Sparkles size={16} />
                确认清理
              </button>
              
              <button
                onClick={() => {
                  setShowCleanConfirm(false);
                  setCleaningStats(null);
                }}
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 px-4 rounded-lg
                          transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🔥 紧凑快捷键提示（仅在工具栏展开时显示） */}
      {!isCollapsed && (
        <div 
          className="fixed z-40 pointer-events-none"
          style={{ 
            left: `${position.x}px`, 
            top: `${position.y + 120}px` // 在工具栏下方
          }}
        >
          <div className="bg-gray-800/90 backdrop-blur-sm text-white text-xs rounded-lg px-2 py-1 max-w-xs">
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
              <div>Ctrl+Z: 撤销</div>
              <div>Ctrl+Y: 重做</div>
              <div>Ctrl+S: 保存</div>
              <div>Del: 删除</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default EditToolbar; 