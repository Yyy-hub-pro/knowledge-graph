// 数据处理工具函数

/**
 * 清理节点名称中的特殊符号
 * @param {string} name - 原始节点名称
 * @returns {string} - 清理后的名称
 */
export const cleanNodeName = (name) => {
  if (!name || typeof name !== 'string') return name;
  
  // 移除技能节点的 %@...@% 格式
  let cleaned = name.replace(/%@(.+?)@%/g, '$1');
  
  // 移除知识节点的 ##@...@## 格式
  cleaned = cleaned.replace(/##@(.+?)@##/g, '$1');
  
  // 移除其他可能的特殊符号组合
  cleaned = cleaned.replace(/[@#%]+/g, '');
  
  // 清理多余的空格
  cleaned = cleaned.trim();
  
  return cleaned;
};

/**
 * 清理整个节点数据
 * @param {Object} node - 节点对象
 * @returns {Object} - 清理后的节点对象
 */
export const cleanNodeData = (node) => {
  if (!node) return node;
  
  return {
    ...node,
    name: cleanNodeName(node.name),
    // 如果描述中也有这些符号，一并清理
    description: node.description ? cleanNodeName(node.description) : node.description
  };
};

/**
 * 批量清理节点数组
 * @param {Array} nodes - 节点数组
 * @returns {Array} - 清理后的节点数组
 */
export const cleanNodesData = (nodes) => {
  if (!Array.isArray(nodes)) return nodes;
  
  return nodes.map(cleanNodeData);
};

/**
 * 清理整个图谱数据
 * @param {Object} graphData - 图谱数据对象 {nodes, links}
 * @returns {Object} - 清理后的图谱数据
 */
export const cleanGraphData = (graphData) => {
  if (!graphData) return graphData;
  
  return {
    ...graphData,
    nodes: cleanNodesData(graphData.nodes),
    // links 数据通常不需要清理，但保持结构一致
    links: graphData.links || []
  };
};

/**
 * 检查节点名称是否包含特殊符号
 * @param {string} name - 节点名称
 * @returns {boolean} - 是否包含特殊符号
 */
export const hasSpecialSymbols = (name) => {
  if (!name || typeof name !== 'string') return false;
  
  return /%@.+?@%|##@.+?@##|[@#%]/.test(name);
};

/**
 * 统计数据中包含特殊符号的节点数量
 * @param {Array} nodes - 节点数组
 * @returns {Object} - 统计结果
 */
export const analyzeSymbolUsage = (nodes) => {
  if (!Array.isArray(nodes)) return { total: 0, withSymbols: 0, byLayer: {} };
  
  const result = {
    total: nodes.length,
    withSymbols: 0,
    byLayer: {}
  };
  
  nodes.forEach(node => {
    const layer = node.layer || 'unknown';
    if (!result.byLayer[layer]) {
      result.byLayer[layer] = { total: 0, withSymbols: 0 };
    }
    
    result.byLayer[layer].total++;
    
    if (hasSpecialSymbols(node.name)) {
      result.withSymbols++;
      result.byLayer[layer].withSymbols++;
    }
  });
  
  return result;
}; 