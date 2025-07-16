import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, Play, Pause, Download, Zap, Globe, BookOpen, Briefcase, GraduationCap, TrendingUp, ChevronRight, ChevronLeft, FileText, BarChart2, LinkIcon } from 'lucide-react';
import * as d3 from 'd3';

// 编辑功能导入
import { EditProvider, useEdit } from './components/EditContext';
import EditToolbar from './components/EditToolbar';

// 🔥 导入数据清理工具
import { cleanGraphData, analyzeSymbolUsage } from './utils/dataUtils';

// 导入新生成的4层数据文件
import nodesInd from './data/nodes_ind.json';        // 24个产业节点
import nodesJob from './data/nodes_job.json';        // 46个岗位节点  
import nodesSkill from './data/nodes_skill.json';    // 77个技能节点
import nodesKnow from './data/nodes_know.json';      // 165个知识节点
import links from './data/links.json';               // 282个两两关系
import relationshipsRaw from './data/relationships_raw.json'; // 94个原始四元关系

// 🔥 合并并清理所有节点数据
const rawLayeredData = {
  nodes: [...nodesInd, ...nodesJob, ...nodesSkill, ...nodesKnow],
  links: links,
  quaternaryRelations: relationshipsRaw
};

// 🔥 应用数据清理，移除特殊符号
const layeredData = cleanGraphData(rawLayeredData);

// 🔥 打印清理统计信息
const symbolStats = analyzeSymbolUsage(rawLayeredData.nodes);
console.log('🧹 数据清理统计:', {
  总节点数: symbolStats.total,
  包含符号的节点: symbolStats.withSymbols,
  各层级统计: symbolStats.byLayer
});

// 内部组件 - 使用编辑上下文
const LayeredKnowledgeGraphInner = ({ graphData, resetToOriginal, exportEditedData, importEditedData }) => {
  const svgRef = useRef();
  
  // 使用编辑上下文
  const { editState, selectNode } = useEdit();
  
  // 【新功能】定义需要高亮的关键学习路径链接
  const criticalPathLinks = useMemo(() => new Set([
    // 链路一：增长黑客 (L1 -> L2 -> L3 -> L4)
    'ind_jjj_08-job_jjj_08', // 产业: 用户为中心的营销 -> 岗位: 用户增长经理
    'job_jjj_08-k_jjj_49',   // 岗位: 用户增长经理 -> 知识: AARRR模型
    'k_jjj_49-r_ani_02',     // 知识: AARRR模型 -> 资源: AARRR漏斗模型动画

    // 链路二：品牌公关 (L1 -> L2 -> L3 -> L4)
    'ind_jjj_01-job_jjj_13', // 产业: 内容营销 -> 岗位: 品牌公关经理
    'ind_jjj_06-job_jjj_13', // 产业: Z世代营销 -> 岗位: 品牌公关经理
    'job_jjj_13-k_jjj_86',   // 岗位: 品牌公关经理 -> 知识: 品牌危机公关管理
    'k_jjj_86-r_h5_13'      // 知识: 品牌危机公关管理 -> 资源: 品牌危机公关模拟实验室
  ]), []);

  // 🔥 修复关键数据流问题：使用父组件传递的graphData而不是静态layeredData
  const currentData = useMemo(() => {
    if (editState.isEditMode) {
      return editState.data;
    }
    // 退出编辑模式时，使用父组件保存的编辑后数据
    return {
      nodes: graphData.nodes,
      links: graphData.links
    };
  }, [editState.isEditMode, editState.data, graphData]);
  
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedLink, setSelectedLink] = useState(null);  // 新增：选中的关系
  const [isPlaying, setIsPlaying] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLayer, setFilterLayer] = useState('all');
  const [simulation, setSimulation] = useState(null);
  const dimensions = useMemo(() => ({ width: 1400, height: 900 }), []);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [showH5SimModal, setShowH5SimModal] = useState(false);

  // 层级配置 - 4层结构
  const layers = useMemo(() => ({
    1: { 
      name: '产业需求图', 
      subtitle: 'The "Why" - 驱动力',
      icon: TrendingUp, 
      color: '#ef4444',
      description: '跨境电商行业发展趋势和市场需求'
    },
    2: { 
      name: '岗位画像图', 
      subtitle: 'The "What" - 承载者',
      icon: Briefcase, 
      color: '#3b82f6',
      description: '行业发展催生的专业岗位需求'
    },
    3: { 
      name: '技能要求图', 
      subtitle: 'The "How" - 技能',
      icon: Zap, 
      color: '#10b981',
      description: '岗位所需的核心技能和专业能力'
    },
    4: { 
      name: '知识基础图', 
      subtitle: 'The "Knowledge" - 知识',
      icon: GraduationCap, 
      color: '#8b5cf6',
      description: '支撑技能发展的理论知识基础'
    }
  }), []);

  // 知识类型配置
  const knowledgeTypes = useMemo(() => ({
    '理论基础': { color: '#8b5cf6', icon: '📚' },
    '核心技能': { color: '#f59e0b', icon: '🛠️' },
    '框架工具': { color: '#06b6d4', icon: '⚙️' }
  }), []);

  const difficultyColors = useMemo(() => ({
    '入门': '#10b981',
    '进阶': '#f59e0b', 
    '精通': '#ef4444'
  }), []);

  // 初始化D3力导向图
  const initializeGraph = useCallback(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const { width, height } = dimensions;
    
    // 创建主容器
    const container = svg
      .attr("width", width)
      .attr("height", height)
      .style("background", "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)")
      .style("border-radius", "12px");

    // 添加梦幻星空背景
    const starsCount = 200;
    const starsData = Array.from({ length: starsCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 1.5,
      opacity: Math.random() * 0.8 + 0.2,
      blinkDuration: Math.random() * 3000 + 2000
    }));
    
    const stars = container.append("g")
      .selectAll("circle")
      .data(starsData)
      .enter()
      .append("circle")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("r", d => d.radius)
      .attr("fill", "#ffffff")
      .attr("opacity", d => d.opacity);
    
    stars.each(function(d) {
      d3.select(this)
        .transition()
        .duration(d.blinkDuration)
        .attr("opacity", 0.2)
        .transition()
        .duration(d.blinkDuration)
        .attr("opacity", d.opacity)
        .on("end", function repeat() {
          d3.select(this)
            .transition()
            .duration(d.blinkDuration)
            .attr("opacity", 0.2)
            .transition()
            .duration(d.blinkDuration)
            .attr("opacity", d.opacity)
            .on("end", repeat);
        });
    });
    
    const nebulasCount = 5;
    const nebulasData = Array.from({ length: nebulasCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 100 + 50,
      color: d3.interpolateInferno(Math.random())
    }));
    
    // eslint-disable-next-line no-unused-vars
    const nebulas = container.append("g")
      .selectAll("circle")
      .data(nebulasData)
      .enter()
      .append("circle")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("r", d => d.radius)
      .attr("fill", d => d.color)
      .attr("opacity", 0.1)
      .style("filter", "blur(30px)");

    const g = container.append("g");

    const zoom = d3.zoom()
      .scaleExtent([0.1, 3])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom);

    const getLinkId = (link) => `${link.source.id || link.source}-${link.target.id || link.target}`;

    let filteredNodes = currentData.nodes;
    let filteredLinks = currentData.links;

    if (filterLayer !== 'all') {
      const layerNum = parseInt(filterLayer);
      filteredNodes = currentData.nodes.filter(node => node.layer === layerNum || node.layer === 0);
      const nodeIds = new Set(filteredNodes.map(node => node.id));
      filteredLinks = currentData.links.filter(link => 
        nodeIds.has(typeof link.source === 'object' ? link.source.id : link.source) && 
        nodeIds.has(typeof link.target === 'object' ? link.target.id : link.target)
      );
    }

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matchedNodes = new Set(currentData.nodes.filter(node => 
        node.name.toLowerCase().includes(searchLower) ||
        (node.keywords && node.keywords.some(k => k.toLowerCase().includes(searchLower)))
      ).map(n => n.id));

      if (matchedNodes.size > 0) {
        const relatedNodeIds = new Set(matchedNodes);
        currentData.links.forEach(link => {
            const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
            const targetId = typeof link.target === 'object' ? link.target.id : link.target;
            if (matchedNodes.has(sourceId)) relatedNodeIds.add(targetId);
            if (matchedNodes.has(targetId)) relatedNodeIds.add(sourceId);
        });
        filteredNodes = currentData.nodes.filter(node => relatedNodeIds.has(node.id));
      } else {
        filteredNodes = [];
      }
      
      const nodeIds = new Set(filteredNodes.map(node => node.id));
      filteredLinks = currentData.links.filter(link => 
        nodeIds.has(typeof link.source === 'object' ? link.source.id : link.source) && 
        nodeIds.has(typeof link.target === 'object' ? link.target.id : link.target)
      );
    }

    // 🔥 关键修复：为D3.js创建links的深拷贝，避免原始数据被修改
    const d3Links = filteredLinks.map(link => ({
      ...link,
      source: link.source,
      target: link.target
    }));

    const sim = d3.forceSimulation(filteredNodes)
        .force("link", d3.forceLink(d3Links).id(d => d.id).distance(d => {
          if (d.source.id === 'origin_center' || d.target.id === 'origin_center') {
            return 180;
          }
          if (Math.abs(d.source.layer - d.target.layer) > 0) {
            return 150 + Math.abs(d.source.layer - d.target.layer) * 30;
          }
          return 100;
        }).strength(0.15))
        .force("charge", d3.forceManyBody().strength(d => {
          // 【布局调整】调整装饰性节点的排斥力，使其更分散，但依然作为背景
          if (d.is_decorative) return -50;
          return -400 - d.size * 10;
        }))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collision", d3.forceCollide().radius(d => {
          // 【布局调整】略微增加装饰性节点的碰撞体积，防止过度重叠
          if (d.is_decorative) return d.size + 5;
          return d.size + 15;
        }))
        .force("x", d3.forceX().x(width / 2).strength(d => d.layer === 0 ? 0.8 : 0.03))
        .force("y", d3.forceY().y(d => {
          let baseY;
          if (d.layer === 0) { baseY = height * 0.03; }
          else if (d.layer === 1) { baseY = height * 0.12; }
          else if (d.layer === 2) { baseY = height * 0.28; }
          else if (d.layer === 3) { baseY = height * 0.45; }
          else if (d.layer === 4) { baseY = height * 0.65; }
          else if (d.layer === 5) { baseY = height * 0.85; }
          else { baseY = height * 0.8; }
          
          // 【布局调整】增加垂直抖动，使布局更有机，装饰性节点抖动范围更大
          const jitter = d.is_decorative ? height * 0.12 : height * 0.02;
          return baseY + (Math.random() - 0.5) * 2 * jitter;
        }).strength(d => {
            // 【布局调整】减弱装饰性节点的Y轴约束，允许其更自由地分布
            if (d.is_decorative) return 0.08;
            if (d.layer === 0) return 1.5;
            return 0.6;
        }));

    setSimulation(sim);

    const defs = g.append("defs");
    Object.entries(layers).forEach(([key, layer]) => {
      defs.append("marker")
        .attr("id", `arrow-${key}`)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 15)
        .attr("refY", 0)
        .attr("markerWidth", 4)
        .attr("markerHeight", 4)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", layer.color)
        .style("opacity", 0.8);
    });

    // 【性能优化】修改链接样式
    const links = g.append("g")
      .selectAll("line")
      .data(d3Links)
      .enter().append("line")
      .attr("stroke", d => { // 【新功能】高亮关键链路
        if (criticalPathLinks.has(getLinkId(d))) {
          return "#fde047"; // 使用醒目的金色
        }
        return "#4b5563"; // 默认的暗灰色
      })
      .attr("stroke-opacity", d => { // 【新功能】提高关键链路不透明度
        if (criticalPathLinks.has(getLinkId(d))) {
          return 0.9;
        }
        return 0.3; // 默认不透明度
      })
      .attr("stroke-width", d => {
        const isCritical = criticalPathLinks.has(getLinkId(d));
        const targetNode = filteredNodes.find(n => n.id === (d.target.id || d.target));
        if (targetNode && targetNode.layer === 4) {
          return Math.sqrt(d.strength || 1) * (isCritical ? 2.5 : 1.5);
        }
        if (targetNode && targetNode.layer === 5) {
          return Math.sqrt(d.strength || 1) * (isCritical ? 2.0 : 1.2);
        }
        const sourceNode = filteredNodes.find(n => n.id === (d.source.id || d.source));
        if (sourceNode && sourceNode.id === 'origin_center') {
          return Math.sqrt(d.strength || 1) * 3.5;
        }
        return Math.sqrt(d.strength || 1) * (isCritical ? 3.5 : 2.5);
      })
      .attr("stroke-dasharray", d => {
        const targetNode = filteredNodes.find(n => n.id === (d.target.id || d.target));
        if (targetNode && targetNode.layer === 4) {
          return "4,2";
        }
        if (targetNode && targetNode.layer === 5) {
          return "2,1";
        }
        const sourceNode = filteredNodes.find(n => n.id === (d.source.id || d.source));
        if (sourceNode && sourceNode.id === 'origin_center') {
          return "10,5";
        }
        return "8,4";
      })
      .attr("stroke-dashoffset", 0)
      .attr("marker-end", d => {
        const targetNode = filteredNodes.find(n => n.id === (d.target.id || d.target));
        if (targetNode && (targetNode.layer === 4 || targetNode.layer === 5)) {
          return "";
        }
        return targetNode ? `url(#arrow-${targetNode.layer})` : "";
      })
      .style("cursor", "pointer")  // 新增：鼠标悬停时显示手形光标
      .on("click", function(event, d) {  // 新增：点击事件处理
        event.stopPropagation();
        setSelectedLink(d);
        setSelectedNode(null); // 清除选中的节点
      })
      .each(function(d) { // 【新功能】为关键链路添加脉动动画
        if (criticalPathLinks.has(getLinkId(d))) {
        d3.select(this)
          .transition()
            .duration(1500)
          .ease(d3.easeLinear)
            .style("stroke-opacity", 0.6)
            .transition()
            .duration(1500)
            .ease(d3.easeLinear)
            .style("stroke-opacity", 1)
          .on("end", function repeat() {
            d3.select(this)
              .transition()
                .duration(1500)
              .ease(d3.easeLinear)
                .style("stroke-opacity", 0.6)
                .transition()
                .duration(1500)
                .ease(d3.easeLinear)
                .style("stroke-opacity", 1)
              .on("end", repeat);
          });
        }
      });

    const nodeGroups = g.append("g")
      .selectAll("g")
      .data(filteredNodes)
      .enter().append("g")
      .style("cursor", d => d.is_decorative ? "default" : "pointer")
      .call(d3.drag()
        .on("start", (event, d) => !d.is_decorative && dragstarted(event, d))
        .on("drag", (event, d) => !d.is_decorative && dragged(event, d))
        .on("end", (event, d) => !d.is_decorative && dragended(event, d)));

    nodeGroups.append("circle")
      .attr("class", "node-main")
      .attr("r", d => d.size)
      .attr("fill", d => {
        if (d.is_decorative) return d.color;
        if (d.layer === 3 && d.skill_type) {
          return "#10b981"; // 技能层统一使用绿色
        }
        if (d.layer === 4 && d.knowledge_type) {
          return "#8b5cf6"; // 知识层统一使用紫色
        }
        return d.color;
      })
      // 🔥 性能优化：移除drop-shadow滤镜，改用简单边框
      .style("stroke", d => {
        if (editState.isEditMode && editState.selectedNodes.includes(d.id)) {
          return "#ff4444"; // 选中节点使用红色边框
        }
        return "#ffffff";
      })
      .style("stroke-width", d => {
        if (editState.isEditMode && editState.selectedNodes.includes(d.id)) {
          return 4; // 选中节点使用更粗的边框
        }
        return d.is_decorative ? 0.5 : 1.5;
      })
      .style("stroke-opacity", d => d.is_decorative ? 0.3 : 0.8)
      .style("opacity", d => {
        if (editState.isEditMode && editState.selectedNodes.length > 0 && !editState.selectedNodes.includes(d.id)) {
          return 0.6; // 未选中的节点在编辑模式下变暗
        }
        return 1;
      });

    nodeGroups.on("click", (event, d) => {
      if (d.is_decorative) return;
      event.stopPropagation();
      
      // 编辑模式下的处理
      if (editState.isEditMode) {
        selectNode(d.id);
        return;
      }
      
      // 普通模式下的原有行为
      setSelectedNode(d);
      setSelectedLink(null); // 清除选中的关系
    })
    // 【性能优化】更新悬停交互
    .on("mouseover", function(event, d) {
      if (d.is_decorative) return;
      
      d3.select(this).select(".node-main")
        .transition()
        .duration(200)
        .attr("r", d.size + (d.layer === 4 || d.layer === 5 ? 4 : 8))
        // 🔥 性能优化：移除drop-shadow，改用stroke变化
        .style("stroke-width", d.is_decorative ? 1 : 3);
      
      // 【关键优化】只修改非关键路径的链接样式，让关键路径永久高亮
      links.filter(l => !criticalPathLinks.has(getLinkId(l)))
        .style("stroke", l => {
          const sourceId = l.source.id || l.source;
          const targetId = l.target.id || l.target;
          if (sourceId === d.id || targetId === d.id) {
            const targetNode = filteredNodes.find(n => n.id === (l.target.id || l.target));
            if (targetNode && targetNode.layer === 4) {
              return targetNode.color || "#8b5cf6";
            }
            if (targetNode && targetNode.layer === 5) {
              return targetNode.color || "#f59e0b";
            }
            const sourceNode = filteredNodes.find(n => n.id === (l.source.id || l.source));
            if (sourceNode && sourceNode.id === 'origin_center') {
              return "#8b5cf6";
            }
            if (targetNode) {
              return layers[targetNode.layer]?.color || "#64748b";
            }
            return "#64748b";
          }
          return "#4b5563";
        })
        .style("stroke-opacity", l => {
          const sourceId = l.source.id || l.source;
          const targetId = l.target.id || l.target;
          return (sourceId === d.id || targetId === d.id) ? 1 : 0.1;
        })
        .style("stroke-width", l => {
          const sourceId = l.source.id || l.source;
          const targetId = l.target.id || l.target;
          if (sourceId === d.id || targetId === d.id) {
              return Math.sqrt(l.strength || 1) * 4.5;
          }
          const targetNode = filteredNodes.find(n => n.id === (l.target.id || l.target));
          if (targetNode && targetNode.layer === 4) { return Math.sqrt(l.strength || 1) * 1.5; }
          if (targetNode && targetNode.layer === 5) { return Math.sqrt(l.strength || 1) * 1.2; }
          const sourceNode = filteredNodes.find(n => n.id === (l.source.id || l.source));
          if (sourceNode && sourceNode.id === 'origin_center') { return Math.sqrt(l.strength || 1) * 3.5; }
          return Math.sqrt(l.strength || 1) * 2.5;
        });
    })
    .on("mouseout", function(event, d) {
      if (d.is_decorative) return;
      
      d3.select(this).select(".node-main")
        .transition()
        .duration(200)
        .attr("r", d.size)
        // 🔥 性能优化：移除drop-shadow，恢复默认stroke-width
        .style("stroke-width", d.is_decorative ? 0.5 : 1.5);
      
      // 【关键优化】只恢复非关键路径的链接样式
      links.filter(l => !criticalPathLinks.has(getLinkId(l)))
        .style("stroke", "#4b5563")
        .style("stroke-opacity", 0.3)
        .style("stroke-width", l => {
          const targetNode = filteredNodes.find(n => n.id === (l.target.id || l.target));
          if (targetNode && targetNode.layer === 4) {
            return Math.sqrt(l.strength || 1) * 1.5;
          }
          if (targetNode && targetNode.layer === 5) {
            return Math.sqrt(l.strength || 1) * 1.2;
          }
          const sourceNode = filteredNodes.find(n => n.id === (l.source.id || l.source));
          if (sourceNode && sourceNode.id === 'origin_center') {
            return Math.sqrt(l.strength || 1) * 3.5;
          }
          return Math.sqrt(l.strength || 1) * 2.5;
        });
    });

    nodeGroups.append("text")
      .attr("class", "layer-indicator")
      .attr("text-anchor", "middle")
      .attr("dy", "-0.5em")
      .style("font-size", "10px")
      .style("fill", "#94a3b8")
      .style("font-weight", "bold")
      .style("pointer-events", "none")
      .text(d => d.layer > 0 ? `L${d.layer}`: '');

    nodeGroups.append("text")
      .attr("class", "node-icon")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .style("font-size", d => `${Math.min(d.size / 2, 16)}px`)
      .style("fill", "#ffffff")
      .style("font-weight", "bold")
      .style("pointer-events", "none")
      .text(d => {
        if (d.layer === 0) return '🚀';
        if (d.layer === 1) return '🏭';
        if (d.layer === 2) return '💼';
        if (d.layer === 3 && d.skill_type) {
          return "🛠️"; // 技能层使用锤子图标
        }
        if (d.layer === 4 && d.knowledge_type) {
          return "📚"; // 知识层使用书本图标
        }
        if (d.layer === 5) {
          return "📖"; // 资源层使用书本图标
        }
        return "●";
      });

    nodeGroups.append("text")
      .attr("dy", 4)
      .attr("text-anchor", "middle")
      .style("fill", d => d.is_decorative ? "#94a3b8" : "#ffffff")
      .style("font-weight", d => d.is_decorative ? "normal" : "bold")
      .style("font-size", d => {
        if (d.layer === 0) return "16px";
        if (d.layer === 1) return "14px";
        if (d.layer === 2) return "12px";
        if (d.layer === 3) return "11px";
        if (d.layer === 4) return "10px";
        if (d.layer === 5) return "9px";
        return "10px";
      })
      .style("opacity", d => d.is_decorative ? 0.6 : 1)
      .style("pointer-events", "none")
      .style("text-shadow", d => d.is_decorative ? "none" : "0 0 4px rgba(0,0,0,0.8)")
      .text(d => {
        const maxLength = d.size * 0.8;
        let name = d.name;
        if (name.length > maxLength) {
          name = name.substring(0, maxLength) + '...';
        }
        return name;
      });

    function dragstarted(event, d) {
      if (!event.active) sim.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event, d) {
      if (!event.active) sim.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    sim.on("tick", () => {
      links
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

      nodeGroups
        .attr("transform", d => `translate(${d.x},${d.y})`);
    });

    svg.on("click", () => {
      setSelectedNode(null);
      setSelectedLink(null);
    });

  }, [dimensions, currentData.nodes, currentData.links, filterLayer, searchTerm, layers, criticalPathLinks, editState.isEditMode, editState.selectedNodes, selectNode]);

  useEffect(() => {
    initializeGraph();
  }, [initializeGraph]);

  const toggleAnimation = () => {
    if (simulation) {
      if (isPlaying) {
        simulation.stop();
      } else {
        simulation.alpha(0.3).restart();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const getLayerStats = () => {
    const stats = {};
    Object.keys(layers).forEach(layer => {
      stats[layer] = currentData.nodes.filter(node => node.layer === parseInt(layer)).length;
    });
    return stats;
  };

  // 🔥 新增：查看研究报告功能
  const navigateToReports = () => {
    const url = '/knowledge-graph/课件资源/研究报告/index.html';
    window.open(url, '_blank');
  };
  
  const getLinkExplanation = (source, target, linkData = null) => {
    // 优先使用JSON数据中的真实描述
    if (linkData?.evidence_detail && linkData.evidence_detail.trim() !== '') {
      return linkData.evidence_detail;
    }
    
    // 回退到默认模板
    if (source.layer === 1 && target.layer === 2) {
      return `产业趋势 "${source.name}" 的发展，直接催生了对 "${target.name}" 岗位的市场需求，旨在抓住新兴的市场机遇。`;
    }
    if (source.layer === 2 && target.layer === 3) {
      const responsibility = source.core_responsibilities ? `的核心职责，如"${source.core_responsibilities[0]}"` : '';
      return `为了胜任 "${source.name}" 岗位${responsibility}，掌握 "${target.name}" 这项核心技能是必不可少的。`;
    }
    if (source.layer === 3 && target.layer === 4) {
      return `掌握 "${source.name}" 技能需要扎实的 "${target.name}" 理论知识作为支撑。`;
    }
    if (source.layer === 4 && target.layer === 5) {
      return `学习 "${source.name}" 知识可以通过 "${target.name}" 教学资源进行实践。`;
    }
    return null;
  };

  const layerStats = getLayerStats();

  return (
    <div className="w-full h-screen bg-gray-900 text-white p-4 flex flex-col">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between mb-2 bg-gray-800 rounded-lg p-2 flex-shrink-0 flex-nowrap overflow-x-auto">
        <div className="flex items-center space-x-3 flex-nowrap">
          <div>
            <h1 className="text-xl font-bold text-white">跨境电商课程四图一库构建</h1>
            <p className="text-xs text-gray-400 mt-0.5">产业图→岗位图→技能图→知识图→资源库</p>
          </div>
          
          <div className="flex items-center space-x-2 flex-nowrap">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 w-3 h-3" />
              <input
                type="text"
                placeholder="搜索节点或关键词..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-7 pr-2 py-1 bg-gray-700 rounded-lg text-xs text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 w-48"
              />
            </div>
            
            <select
              value={filterLayer}
              onChange={(e) => setFilterLayer(e.target.value)}
              className="bg-gray-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">显示所有层级</option>
              {Object.entries(layers).map(([key, layer]) => (
                <option key={key} value={key}>
                  L{key}: {layer.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        
          <div className="flex items-center space-x-2 flex-nowrap">
            <button
              onClick={toggleAnimation}
              className={`flex items-center space-x-1 px-2 py-1 rounded-lg transition-all duration-300 ${
                isPlaying ?
                'bg-orange-600 hover:bg-orange-700 shadow-lg shadow-orange-500/25' : 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/25'
              }`}
            >
              {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              <span className="text-xs font-medium">{isPlaying ? '暂停动画' : '播放动画'}</span>
            </button>
            
            <button
              onClick={() => {
                if (simulation) {
                  simulation.alpha(1).restart();
                }
              }}
              className="flex items-center space-x-1 bg-purple-600 hover:bg-purple-700 px-2 py-1 rounded-lg transition-all duration-300 shadow-lg shadow-purple-500/25"
            >
              <Zap className="w-3 h-3" />
              <span className="text-xs font-medium">重新布局</span>
            </button>

            <button
              onClick={navigateToReports}
              className="flex items-center space-x-1 bg-amber-600 hover:bg-amber-700 px-2 py-1 rounded-lg transition-all duration-300 shadow-lg shadow-amber-500/25"
            >
              <FileText className="w-3 h-3" />
              <span className="text-xs font-medium">查看研究报告</span>
            </button>

            {/* 🔥 数据管理功能 */}
            <div className="flex items-center space-x-1 border-l border-gray-600 pl-2">
              <button
                onClick={exportEditedData}
                className="flex items-center space-x-1 bg-indigo-600 hover:bg-indigo-700 px-2 py-1 rounded-lg transition-all duration-300 shadow-lg shadow-indigo-500/25"
                title="导出编辑后的数据"
              >
                <Download className="w-3 h-3" />
                <span className="text-xs font-medium">保存数据</span>
              </button>

              <button
                onClick={importEditedData}
                className="flex items-center space-x-1 bg-yellow-600 hover:bg-yellow-700 px-2 py-1 rounded-lg transition-all duration-300 shadow-lg shadow-yellow-500/25"
                title="导入编辑数据"
              >
                <FileText className="w-3 h-3" />
                <span className="text-xs font-medium">加载数据</span>
              </button>

              <button
                onClick={resetToOriginal}
                className="flex items-center space-x-1 bg-red-600 hover:bg-red-700 px-2 py-1 rounded-lg transition-all duration-300 shadow-lg shadow-red-500/25"
                title="重置到原始数据"
              >
                <Zap className="w-3 h-3" />
                <span className="text-xs font-medium">重置数据</span>
              </button>

              {/* 数据状态指示器 */}
              {(() => {
                const hasEdits = localStorage.getItem('knowledge-graph-edits') !== null;
                return hasEdits && (
                  <div className="flex items-center space-x-1 bg-green-800/50 px-2 py-1 rounded-lg border border-green-600/50">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                    <span className="text-xs font-medium text-green-300">已保存</span>
                  </div>
                );
              })()}
            </div>

            <button
              onClick={() => {
                if (document.fullscreenElement) {
                  document.exitFullscreen();
                } else {
                  document.documentElement.requestFullscreen();
                }
              }}
              className="flex items-center space-x-1 bg-gray-600 hover:bg-gray-700 px-2 py-1 rounded-lg transition-all duration-300 shadow-lg shadow-gray-500/25"
            >
              <Globe className="w-3 h-3" />
              <span className="text-xs font-medium">全屏</span>
            </button>
          </div>
      </div>

      <div className="flex gap-4 flex-grow min-h-0">
        <div className="flex-1 bg-gray-800 rounded-lg overflow-hidden relative">
          <svg ref={svgRef} className="w-full h-full"></svg>
          
          {/* 🔥 技术支持署名标识 - 移到右上角 */}
          <div className="absolute top-2 right-2 pointer-events-none z-10">
            <div className="bg-gray-900/80 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-gray-700/50">
              <div className="flex items-center space-x-2 text-xs">
                <span className="text-gray-400">Powered by</span>
                <span className="text-blue-400 font-medium">ZWHZ MOA</span>
                <span className="text-gray-500">|</span>
                <span className="text-purple-400 font-medium">课研AI</span>
                <span className="text-gray-400">提供支持</span>
              </div>
            </div>
          </div>
          
          <div 
            className={`absolute top-4 transition-all duration-300 ${
              sidebarExpanded 
                ? "right-4 bg-gray-900 bg-opacity-95 rounded-lg p-4 min-w-64 max-h-[85%] shadow-xl flex flex-col" 
                : "right-0 bg-gray-900 bg-opacity-80 rounded-l-lg p-2 overflow-hidden"
            }`}
            style={{ 
              maxWidth: sidebarExpanded ? '300px' : '40px',
              maxHeight: sidebarExpanded ? 'calc(100% - 120px)' : '40px',
              bottom: sidebarExpanded ? 'auto' : '50%',
              transform: sidebarExpanded ? 'none' : 'translateY(50%)',
              zIndex: 10 
            }}
          >
            <div 
              className="absolute top-2 left-2 cursor-pointer z-10 bg-gray-800 rounded-full p-1.5 hover:bg-gray-700"
              onClick={() => setSidebarExpanded(!sidebarExpanded)}
            >
              {sidebarExpanded 
                ? <ChevronRight className="w-4 h-4 text-gray-300" /> 
                : <ChevronLeft className="w-4 h-4 text-gray-300" />}
            </div>

            {sidebarExpanded ? (
              <>
                <div className="flex-1 overflow-y-auto pr-1 sidebar-scroll">
                  <h3 className="text-lg font-semibold mb-3 text-center">三图一库 四层知识架构</h3>
                  <div className="space-y-3">
                    {Object.entries(layers).map(([key, layer]) => {
                      const IconComponent = layer.icon;
                      return (
                        <div key={key} className="flex items-start space-x-3 p-2 bg-gray-800 rounded-lg">
                          <div className="flex items-center space-x-2">
                            <div 
                              className="w-4 h-4 rounded-full"
                              style={{ backgroundColor: layer.color }}
                            ></div>
                            <IconComponent className="w-4 h-4" style={{ color: layer.color }} />
                          </div>
                          <div className="flex-1">
                            <div className="font-medium text-sm">{layer.name}</div>
                            <div className="text-xs text-gray-400">{layer.subtitle}</div>
                            <div className="text-xs text-gray-500 mt-1">{layer.description}</div>
                            <div className="text-xs text-blue-400 mt-1">节点数: {layerStats[key] || 0}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  <div className="mt-4 pt-3 border-t border-gray-700">
                    <h4 className="text-sm font-medium mb-2">知识类型分布 (L3)</h4>
                    <div className="space-y-1">
                      {Object.entries(knowledgeTypes).map(([type, config]) => {
                        const count = currentData.nodes.filter(n => n.layer === 3 && n.knowledge_type === type).length;
                        const total = currentData.nodes.filter(n => n.layer === 3).length;
                        const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
                        return (
                          <div key={type} className="flex items-center justify-between text-xs">
                            <div className="flex items-center space-x-2">
                              <span className="text-sm">{config.icon}</span>
                              <div 
                                className="w-3 h-3 rounded"
                                style={{ backgroundColor: config.color }}
                              ></div>
                              <span>{type}</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className="text-gray-400">{count}</span>
                              <div className="w-12 bg-gray-700 rounded-full h-2">
                                <div 
                                  className="h-2 rounded-full transition-all duration-500"
                                  style={{ 
                                    backgroundColor: config.color,
                                    width: `${percentage}%`
                                  }}
                                ></div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-700">
                    <h4 className="text-sm font-medium mb-2">难度等级分布 (L3)</h4>
                    <div className="space-y-1">
                      {Object.entries(difficultyColors).map(([difficulty, color]) => {
                        const count = currentData.nodes.filter(n => n.layer === 3 && n.difficulty === difficulty).length;
                        const total = currentData.nodes.filter(n => n.layer === 3).length;
                        const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
                        return (
                          <div key={difficulty} className="flex items-center justify-between text-xs">
                            <div className="flex items-center space-x-2">
                              <div 
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: color }}
                              ></div>
                              <span>{difficulty}</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className="text-gray-400">{count}</span>
                              <div className="w-12 bg-gray-700 rounded-full h-2">
                                <div 
                                  className="h-2 rounded-full transition-all duration-500"
                                  style={{ 
                                    backgroundColor: color,
                                    width: `${percentage}%`
                                  }}
                                ></div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-700 mb-2">
                    <h4 className="text-sm font-medium mb-2">资源类型分布 (L4)</h4>
                    <div className="space-y-1">
                      {[
                        { type: '3D装备模型', color: '#ef4444' },
                        { type: '师生机组合的演绎数字人', color: '#3b82f6' },
                        { type: '知识与原理动画', color: '#f59e0b' },
                        { type: '简单的H5仿真推演可视化', color: '#10b981' }
                      ].map(({ type, color }) => {
                        const count = currentData.nodes.filter(n => n.layer === 4 && n.resource_type === type).length;
                        const total = currentData.nodes.filter(n => n.layer === 4).length;
                        const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
                        return (
                          <a
                            key={type}
                            href="https://miaokeai.bjzwhz.com/signin"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between text-xs p-1 rounded-md hover:bg-gray-700 transition-colors cursor-pointer"
                          >
                            <div className="flex items-center space-x-2">
                              <div
                                className="w-3 h-3 rounded"
                                style={{ backgroundColor: color }}
                              ></div>
                              <span className="truncate max-w-32">{type}</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className="text-gray-400">{count}</span>
                              <div className="w-12 bg-gray-700 rounded-full h-2">
                                <div
                                  className="h-2 rounded-full transition-all duration-500"
                                  style={{
                                    backgroundColor: color,
                                    width: `${percentage}%`
                                  }}
                                ></div>
                              </div>
                            </div>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="transform -rotate-90 text-sm font-medium text-gray-300 whitespace-nowrap mt-16">
                图谱信息
              </div>
            )}
          </div>

          <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end pointer-events-none">
            <div className="bg-gray-900 bg-opacity-95 rounded-lg px-6 py-3 pointer-events-auto">
              <div className="flex items-center space-x-4 text-sm">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></div>
                  <span>产业需求</span>
                  <span className="text-xs text-gray-400">{layerStats[1] || 0}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-gray-400 animate-pulse">→ 催生 →</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" style={{ animationDelay: '0.5s' }}></div>
                  <span>岗位画像</span>
                  <span className="text-xs text-gray-400">{layerStats[2] || 0}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-gray-400 animate-pulse" style={{ animationDelay: '1s' }}>→ 要求 →</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" style={{ animationDelay: '1.5s' }}></div>
                  <span>技能要求</span>
                  <span className="text-xs text-gray-400">{layerStats[3] || 0}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-gray-400 animate-pulse" style={{ animationDelay: '2s' }}>→ 支持 →</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-purple-500 animate-pulse" style={{ animationDelay: '2.5s' }}></div>
                  <span>知识基础</span>
                  <span className="text-xs text-gray-400">{layerStats[4] || 0}</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-900 bg-opacity-95 rounded-lg px-4 py-2 pointer-events-auto">
              <div className="flex items-center space-x-4 text-xs">
                <div className="text-center">
                  <div className="text-lg font-bold text-cyan-400">{currentData.links.length}</div>
                  <div className="text-gray-400">知识连接</div>
              </div>
                <div className="text-center">
                   <div className="text-lg font-bold text-purple-400">
                    {Math.round((currentData.links.length / (currentData.nodes.length * (currentData.nodes.length - 1) / 2)) * 1000) / 10}%
            </div>
                  <div className="text-gray-400">网络密度</div>
                      </div>
                 <div className="text-center">
                  <div className="text-lg font-bold text-orange-400">
                    {Math.round(currentData.links.length / currentData.nodes.length * 10) / 10}
                        </div>
                  <div className="text-gray-400">平均连接度</div>
                      </div>
                    </div>
              </div>
            </div>

          
          </div>

        <div className="w-96 bg-gray-800 rounded-lg p-4 overflow-y-auto flex-shrink-0 sidebar-scroll">
          <h2 className="text-xl font-semibold mb-4">
            {selectedNode ? '节点详情' : selectedLink ? '关系详情' : '详情面板'}
          </h2>
          
          {selectedNode ? (
            <div className="space-y-4">
              <div className="bg-gray-700 rounded-lg p-4">
                <div className="flex items-center space-x-3 mb-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: selectedNode.color }}
                  >
                    <span className="text-white text-sm font-bold">
                      {selectedNode.layer > 0 ? `L${selectedNode.layer}` : '★'}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{selectedNode.name}</h3>
                    <p className="text-sm text-gray-400">
                      {layers[selectedNode.layer]?.name || "中心节点"}
                    </p>
                  </div>
                </div>
                
                <p className="text-sm text-gray-300 leading-relaxed">
                  {selectedNode.description}
                </p>
              </div>

              {selectedNode.layer === 1 && (
                <div className="bg-gradient-to-r from-red-900/50 to-red-800/50 rounded-lg p-4 border border-red-700/50">
                  <h4 className="font-medium mb-3 text-red-300 flex items-center">
                    <TrendingUp className="w-4 h-4 mr-2" />
                    产业趋势详情
                  </h4>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-300">趋势类型</span>
                      <span className="px-2 py-1 bg-red-700/50 rounded text-red-200 text-xs">
                        {selectedNode.trend_type}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-300">市场规模</span>
                      <span className="text-green-400 font-medium">{selectedNode.market_size}</span>
                    </div>
                    
                    {selectedNode.keywords && (
                      <div>
                        <span className="font-medium text-gray-300 block mb-2">关键词标签</span>
                        <div className="flex flex-wrap gap-1">
                          {selectedNode.keywords.map((keyword, idx) => (
                            <span 
                              key={idx} 
                              className="bg-red-700/30 border border-red-600/50 text-red-200 text-xs px-2 py-1 rounded-full"
                            >
                              #{keyword}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-3 pt-3 border-t border-red-700/50">
                      <span className="font-medium text-gray-300 block mb-2">数据来源</span>
                      <div className="bg-gray-800/50 rounded p-2 text-xs text-gray-300">
                        <div className="font-medium text-blue-300 mb-1">原始位置：</div>
                        <div className="text-gray-400">{selectedNode.original_location}</div>
                        <div className="font-medium text-blue-300 mb-1 mt-2">证据来源：</div>
                        <div className="text-gray-400">{selectedNode.evidence_source}</div>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-red-700/50">
                      <span className="font-medium text-gray-300 block mb-2">影响分析</span>
                      <div className="text-xs text-gray-300 bg-gray-800/50 rounded p-2">
                        {selectedNode.impact_analysis}
                      </div>
                    </div>
                    
                    <div className="mt-3 pt-3 border-t border-red-700/50">
                      <span className="font-medium text-gray-300 block mb-2">催生岗位</span>
                      <div className="space-y-1">
                        {currentData.links
                          .filter(link => (link.source.id || link.source) === selectedNode.id)
                          .slice(0, 5)
                          .map((link, idx) => {
                            const targetNode = currentData.nodes.find(n => n.id === (link.target.id || link.target));
                            return targetNode && (
                              <div key={idx} className="text-xs text-blue-300 flex items-center">
                                <span className="mr-2">→</span>
                                {targetNode.name}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {selectedNode.layer === 2 && (
                <div className="bg-gradient-to-r from-blue-900/50 to-blue-800/50 rounded-lg p-4 border border-blue-700/50">
                  <h4 className="font-medium mb-3 text-blue-300 flex items-center">
                    <Briefcase className="w-4 h-4 mr-2" />
                    岗位画像详情
                  </h4>
                  <div className="space-y-3 text-sm">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-blue-800/30 rounded p-2">
                        <span className="font-medium text-gray-300 block text-xs">岗位级别</span>
                        <span className="text-blue-300 font-bold">{selectedNode.level}</span>
                      </div>
                      <div className="bg-blue-800/30 rounded p-2">
                        <span className="font-medium text-gray-300 block text-xs">所属部门</span>
                        <span className="text-blue-300 font-medium">{selectedNode.department}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-blue-800/30 rounded p-2">
                        <span className="font-medium text-gray-300 block text-xs">薪资范围</span>
                        <span className="text-green-400 font-bold">{selectedNode.salary_range}</span>
                      </div>
                      <div className="bg-blue-800/30 rounded p-2">
                        <span className="font-medium text-gray-300 block text-xs">经验要求</span>
                        <span className="text-yellow-400 font-medium">{selectedNode.experience_requirement}</span>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-blue-700/50">
                      <span className="font-medium text-gray-300 block mb-2">数据来源</span>
                      <div className="bg-gray-800/50 rounded p-2 text-xs text-gray-300">
                        <div className="font-medium text-blue-300 mb-1">原始位置：</div>
                        <div className="text-gray-400">{selectedNode.original_location}</div>
                        <div className="font-medium text-blue-300 mb-1 mt-2">证据来源：</div>
                        <div className="text-gray-400">{selectedNode.evidence_source}</div>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-blue-700/50">
                      <span className="font-medium text-gray-300 block mb-2">招聘市场证据</span>
                      <div className="text-xs text-gray-300 bg-gray-800/50 rounded p-2">
                        {selectedNode.recruitment_evidence}
                      </div>
                    </div>
                    
                    {selectedNode.core_responsibilities && (
                      <div className="mt-3 pt-3 border-t border-blue-700/50">
                        <span className="font-medium text-gray-300 block mb-2">核心职责</span>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {selectedNode.core_responsibilities.map((resp, idx) => (
                            <div key={idx} className="text-gray-300 text-xs flex items-start">
                              <span className="text-blue-400 mr-2 mt-1">•</span>
                              <span>{resp}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-3 pt-3 border-t border-blue-700/50">
                      <span className="font-medium text-gray-300 block mb-2">职业发展路径</span>
                      <div className="text-xs text-gray-300 bg-gray-800/50 rounded p-2">
                        {selectedNode.career_progression}
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-blue-700/50">
                      <span className="font-medium text-gray-300 block mb-2">技能要求</span>
                      <div className="space-y-1">
                        {currentData.links
                          .filter(link => (link.source.id || link.source) === selectedNode.id)
                          .slice(0, 5)
                          .map((link, idx) => {
                            const targetNode = currentData.nodes.find(n => n.id === (link.target.id || link.target));
                            return targetNode && (
                              <div key={idx} className="text-xs text-green-300 flex items-center">
                                <span className="mr-2">→</span>
                                {targetNode.name}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {selectedNode.layer === 3 && (
                <div className="bg-gradient-to-r from-green-900/50 to-green-800/50 rounded-lg p-4 border border-green-700/50">
                  <h4 className="font-medium mb-3 text-green-300 flex items-center">
                    <Zap className="w-4 h-4 mr-2" />
                    技能详情
                  </h4>
                  <div className="space-y-3 text-sm">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-green-800/30 rounded p-2">
                        <span className="font-medium text-gray-300 block text-xs">技能类型</span>
                        <span className="text-green-300 font-bold">{selectedNode.skill_type}</span>
                      </div>
                      <div className="bg-green-800/30 rounded p-2">
                        <span className="font-medium text-gray-300 block text-xs">难度等级</span>
                        <span 
                          className="inline-block mt-1 px-2 py-1 rounded text-xs font-bold text-white"
                          style={{ backgroundColor: difficultyColors[selectedNode.difficulty_level] || '#6b7280' }}
                        >
                          {selectedNode.difficulty_level}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-green-700/50">
                      <span className="font-medium text-gray-300 block mb-2">数据来源</span>
                      <div className="bg-gray-800/50 rounded p-2 text-xs text-gray-300">
                        <div className="font-medium text-green-300 mb-1">原始位置：</div>
                        <div className="text-gray-400">{selectedNode.original_location}</div>
                        <div className="font-medium text-green-300 mb-1 mt-2">证据来源：</div>
                        <div className="text-gray-400">{selectedNode.evidence_source}</div>
                      </div>
                    </div>

                    {selectedNode.application_scenarios && (
                      <div className="mt-3 pt-3 border-t border-green-700/50">
                        <span className="font-medium text-gray-300 block mb-2">应用场景</span>
                        <div className="space-y-1">
                          {selectedNode.application_scenarios.map((scenario, idx) => (
                            <div key={idx} className="text-gray-300 text-xs flex items-start">
                              <span className="text-green-400 mr-2 mt-1">•</span>
                              <span>{scenario}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedNode.mastery_levels && (
                      <div className="mt-3 pt-3 border-t border-green-700/50">
                        <span className="font-medium text-gray-300 block mb-2">掌握层次</span>
                        <div className="space-y-2">
                          {Object.entries(selectedNode.mastery_levels).map(([level, desc], idx) => (
                            <div key={idx} className="text-xs">
                              <span className="text-green-300 font-medium">{level}：</span>
                              <span className="text-gray-400 ml-1">{desc}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-3 pt-3 border-t border-green-700/50">
                      <span className="font-medium text-gray-300 block mb-2">行业需求评估</span>
                      <div className="text-xs text-gray-300 bg-gray-800/50 rounded p-2">
                        {selectedNode.industry_demand}
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-green-700/50">
                      <span className="font-medium text-gray-300 block mb-2">学习资源推荐</span>
                      <div className="space-y-1">
                        {selectedNode.learning_resources && selectedNode.learning_resources.map((resource, idx) => (
                          <div key={idx} className="text-gray-300 text-xs flex items-start">
                            <span className="text-green-400 mr-2 mt-1">•</span>
                            <span>{resource}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-green-700/50">
                      <span className="font-medium text-gray-300 block mb-2">相关岗位</span>
                      <div className="space-y-1">
                        {currentData.links
                          .filter(link => (link.target.id || link.target) === selectedNode.id)
                          .slice(0, 5)
                          .map((link, idx) => {
                            const sourceNode = currentData.nodes.find(n => n.id === (link.source.id || link.source));
                            return sourceNode && sourceNode.layer === 2 && (
                              <div key={idx} className="text-xs text-blue-300 flex items-center">
                                <span className="mr-2">←</span>
                                {sourceNode.name}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {selectedNode.layer === 4 && (
                <div className="bg-gradient-to-r from-purple-900/50 to-purple-800/50 rounded-lg p-4 border border-purple-700/50">
                  <h4 className="font-medium mb-3 text-purple-300 flex items-center">
                    <GraduationCap className="w-4 h-4 mr-2" />
                    知识基础详情
                  </h4>
                  <div className="space-y-3 text-sm">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-purple-800/30 rounded p-2">
                        <span className="font-medium text-gray-300 block text-xs">知识类型</span>
                        <span className="text-purple-300 font-bold">{selectedNode.knowledge_type}</span>
                      </div>
                      <div className="bg-purple-800/30 rounded p-2">
                        <span className="font-medium text-gray-300 block text-xs">复杂度等级</span>
                        <span className="text-purple-300 font-medium">{selectedNode.complexity_level}</span>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-purple-700/50">
                      <span className="font-medium text-gray-300 block mb-2">数据来源</span>
                      <div className="bg-gray-800/50 rounded p-2 text-xs text-gray-300">
                        <div className="font-medium text-purple-300 mb-1">原始位置：</div>
                        <div className="text-gray-400">{selectedNode.original_location}</div>
                        <div className="font-medium text-purple-300 mb-1 mt-2">证据来源：</div>
                        <div className="text-gray-400">{selectedNode.evidence_source}</div>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-purple-700/50">
                      <span className="font-medium text-gray-300 block mb-2">学术基础</span>
                      <div className="text-xs text-gray-300 bg-gray-800/50 rounded p-2">
                        {selectedNode.academic_foundation}
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-purple-700/50">
                      <span className="font-medium text-gray-300 block mb-2">实际应用</span>
                      <div className="text-xs text-gray-300 bg-gray-800/50 rounded p-2">
                        {selectedNode.practical_application}
                      </div>
                    </div>

                    {selectedNode.learning_path && (
                      <div className="mt-3 pt-3 border-t border-purple-700/50">
                        <span className="font-medium text-gray-300 block mb-2">学习路径</span>
                        <div className="space-y-1">
                          {selectedNode.learning_path.map((step, idx) => (
                            <div key={idx} className="text-gray-300 text-xs flex items-start">
                              <span className="text-purple-400 mr-2 mt-1">{idx + 1}.</span>
                              <span>{step}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedNode.prerequisites && (
                      <div className="mt-3 pt-3 border-t border-purple-700/50">
                        <span className="font-medium text-gray-300 block mb-2">前置知识</span>
                        <div className="space-y-1">
                          {selectedNode.prerequisites.map((prereq, idx) => (
                            <div key={idx} className="text-gray-300 text-xs flex items-start">
                              <span className="text-purple-400 mr-2 mt-1">•</span>
                              <span>{prereq}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedNode.assessment_criteria && (
                      <div className="mt-3 pt-3 border-t border-purple-700/50">
                        <span className="font-medium text-gray-300 block mb-2">评估标准</span>
                        <div className="space-y-1">
                          {selectedNode.assessment_criteria.map((criteria, idx) => (
                            <div key={idx} className="text-gray-300 text-xs flex items-start">
                              <span className="text-purple-400 mr-2 mt-1">•</span>
                              <span>{criteria}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-3 pt-3 border-t border-purple-700/50">
                      <span className="font-medium text-gray-300 block mb-2">支撑技能</span>
                      <div className="space-y-1">
                        {currentData.links
                          .filter(link => (link.target.id || link.target) === selectedNode.id)
                          .slice(0, 5)
                          .map((link, idx) => {
                            const sourceNode = currentData.nodes.find(n => n.id === (link.source.id || link.source));
                            return sourceNode && sourceNode.layer === 3 && (
                              <div key={idx} className="text-xs text-green-300 flex items-center">
                                <span className="mr-2">←</span>
                                {sourceNode.name}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-gray-700 rounded-lg p-4">
                <h4 className="font-medium mb-3">关联网络</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {currentData.links
                    .filter(link => 
                      (link.source.id || link.source) === selectedNode.id || 
                      (link.target.id || link.target) === selectedNode.id
                    )
                    .map((link, idx) => {
                      const isSource = (link.source.id || link.source) === selectedNode.id;
                      const relatedNodeId = isSource ? 
                        (link.target.id || link.target) : 
                        (link.source.id || link.source);
                      const relatedNode = currentData.nodes.find(n => n.id === relatedNodeId);
                      
                      if (!relatedNode) return null;

                      const sourceNode = isSource ? selectedNode : relatedNode;
                      const targetNode = isSource ? relatedNode : selectedNode;

                      const explanation = getLinkExplanation(sourceNode, targetNode, link);
                      
                      return (
                        <div key={idx} className="text-xs bg-gray-600 rounded p-3">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="text-lg">{isSource ? '→' : '←'}</span>
                            <span className="font-medium">{relatedNode.name}</span>
                            <span 
                              className="px-1 py-0.5 rounded text-xs"
                              style={{ backgroundColor: layers[relatedNode.layer]?.color }}
                            >
                              L{relatedNode.layer}
                            </span>
                          </div>
                          <div className="text-gray-400">
                            {link.relationship_type || '关联'} (强度: {(link.strength || 0).toFixed(2)})
                          </div>
                          {explanation && (
                            <div className="mt-2 pt-2 border-t border-gray-500/50 text-gray-300 italic">
                              {explanation}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          ) : selectedLink ? (
            <div className="space-y-4">
              {/* 关系基本信息 */}
              <div className="bg-gray-700 rounded-lg p-4">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
                    <span className="text-white text-sm font-bold">→</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">知识关系链接</h3>
                    <p className="text-sm text-gray-400">
                      {selectedLink.layer_transition ? selectedLink.layer_transition.replace('_', ' → ') : '层级转换'}
                    </p>
                  </div>
                </div>
                
                {/* 源节点和目标节点 */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="bg-gray-800/50 rounded p-2">
                    <span className="text-xs text-gray-400 block mb-1">源节点</span>
                    <div className="flex items-center space-x-2">
                      {(() => {
                        const sourceNode = currentData.nodes.find(n => n.id === (selectedLink.source.id || selectedLink.source));
                        return sourceNode ? (
                          <>
                            <div 
                              className="w-4 h-4 rounded-full"
                              style={{ backgroundColor: sourceNode.color }}
                            ></div>
                            <span className="text-sm font-medium text-gray-200">{sourceNode.name}</span>
                          </>
                        ) : <span className="text-sm text-gray-400">未知节点</span>;
                      })()}
                    </div>
                  </div>
                  
                  <div className="bg-gray-800/50 rounded p-2">
                    <span className="text-xs text-gray-400 block mb-1">目标节点</span>
                    <div className="flex items-center space-x-2">
                      {(() => {
                        const targetNode = currentData.nodes.find(n => n.id === (selectedLink.target.id || selectedLink.target));
                        return targetNode ? (
                          <>
                            <div 
                              className="w-4 h-4 rounded-full"
                              style={{ backgroundColor: targetNode.color }}
                            ></div>
                            <span className="text-sm font-medium text-gray-200">{targetNode.name}</span>
                          </>
                        ) : <span className="text-sm text-gray-400">未知节点</span>;
                      })()}
                    </div>
                  </div>
                </div>

                {/* 关系类型和强度 */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-800/50 rounded p-2">
                    <span className="text-xs text-gray-400 block mb-1">关系类型</span>
                    <span className="text-sm font-medium text-blue-300">
                      {selectedLink.relationship_type === 'drives_demand_for' ? '驱动需求' :
                       selectedLink.relationship_type === 'requires' ? '需要技能' :
                       selectedLink.relationship_type === 'depends_on' ? '依赖知识' :
                       selectedLink.relationship_type === 'supports' ? '支持知识' :
                       selectedLink.relationship_type === 'enables' ? '使能技能' :
                       selectedLink.relationship_type === 'serves' ? '服务行业' :
                       selectedLink.relationship_type || '相关'}
                    </span>
                  </div>
                  
                  <div className="bg-gray-800/50 rounded p-2">
                    <span className="text-xs text-gray-400 block mb-1">关系强度</span>
                    <span className="text-sm font-medium text-green-300">
                      {(selectedLink.strength || 0.5).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* 推理逻辑依据 */}
              {selectedLink.evidence_detail && (
                <div className="bg-gradient-to-r from-amber-900/30 to-orange-900/30 rounded-lg p-4 border border-amber-700/50">
                  <h4 className="font-medium mb-3 text-amber-300 flex items-center">
                    <FileText className="w-4 h-4 mr-2" />
                    推理逻辑依据
                  </h4>
                  <div className="text-sm text-gray-300 bg-gray-800/50 rounded p-3 leading-relaxed">
                    {selectedLink.evidence_detail}
                  </div>
                </div>
              )}

              {/* 关系连接说明 */}
              <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 rounded-lg p-4 border border-purple-700/50">
                <h4 className="font-medium mb-3 text-purple-300 flex items-center">
                  <LinkIcon className="w-4 h-4 mr-2" />
                  关系连接说明
                </h4>
                <div className="space-y-3">
                  {(() => {
                    const sourceNode = currentData.nodes.find(n => n.id === (selectedLink.source.id || selectedLink.source));
                    const targetNode = currentData.nodes.find(n => n.id === (selectedLink.target.id || selectedLink.target));
                    
                    // 根据关系类型生成连接说明
                    let connectionDescription = "";
                    if (selectedLink.relationship_type === 'drives_demand_for') {
                      connectionDescription = `${sourceNode?.name}的发展趋势驱动了对${targetNode?.name}岗位的市场需求增长。`;
                    } else if (selectedLink.relationship_type === 'requires') {
                      connectionDescription = `为了胜任${sourceNode?.name}这一岗位的核心职责，从业者需要掌握${targetNode?.name}这项关键技能。`;
                    } else if (selectedLink.relationship_type === 'depends_on') {
                      connectionDescription = `${sourceNode?.name}技能的有效应用，必须建立在对${targetNode?.name}的深入理解和掌握基础之上。`;
                    } else if (selectedLink.relationship_type === 'supports') {
                      connectionDescription = `${sourceNode?.name}为${targetNode?.name}的掌握和应用提供了重要的理论支撑和知识基础。`;
                    } else if (selectedLink.relationship_type === 'enables') {
                      connectionDescription = `掌握了${sourceNode?.name}技能后，能够胜任${targetNode?.name}岗位的相关工作要求。`;
                    } else if (selectedLink.relationship_type === 'serves') {
                      connectionDescription = `${sourceNode?.name}岗位的专业能力直接服务于${targetNode?.name}行业的发展需求。`;
                    } else {
                      connectionDescription = `${sourceNode?.name}与${targetNode?.name}之间存在重要的专业关联。`;
                    }
                    
                    return (
                      <div className="text-sm text-gray-300 bg-gray-800/50 rounded p-3 leading-relaxed">
                        {connectionDescription}
                        
                        {/* 在模板描述下方，显示真实的证据依据 */}
                        {selectedLink.evidence_detail && (
                          <div className="mt-4 pt-3 border-t border-purple-700/30">
                            <div className="text-xs text-purple-300 font-medium mb-2">📄 原始报告依据：</div>
                            <div className="text-xs text-gray-300 bg-gray-900/50 rounded p-2 leading-relaxed border-l-2 border-purple-500/50">
                              {selectedLink.evidence_detail}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* 数据来源信息 */}
              {selectedLink.quaternary_source && (
                <div className="bg-gray-700 rounded-lg p-4">
                  <h4 className="font-medium mb-3 text-gray-300 flex items-center">
                    <BarChart2 className="w-4 h-4 mr-2" />
                    数据溯源
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">四元关系ID</span>
                      <span className="text-blue-300 font-mono">{selectedLink.quaternary_source}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">关系ID</span>
                      <span className="text-blue-300 font-mono">{selectedLink.id}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">层级转换</span>
                      <span className="text-purple-300">{selectedLink.layer_transition}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 相关节点信息 */}
              <div className="bg-gray-700 rounded-lg p-4">
                <h4 className="font-medium mb-3 text-gray-300">关联节点详情</h4>
                <div className="space-y-3">
                  {/* 源节点详情 */}
                  {(() => {
                    const sourceNode = currentData.nodes.find(n => n.id === (selectedLink.source.id || selectedLink.source));
                    return sourceNode && (
                      <div className="bg-gray-800/50 rounded p-3">
                        <div className="flex items-center space-x-2 mb-2">
                          <div 
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: sourceNode.color }}
                          ></div>
                          <span className="font-medium text-sm">{sourceNode.name}</span>
                          <span className="text-xs text-gray-400">
                            ({layers[sourceNode.layer]?.name})
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 line-clamp-2">
                          {sourceNode.description}
                        </p>
                      </div>
                    );
                  })()}
                  
                  {/* 目标节点详情 */}
                  {(() => {
                    const targetNode = currentData.nodes.find(n => n.id === (selectedLink.target.id || selectedLink.target));
                    return targetNode && (
                      <div className="bg-gray-800/50 rounded p-3">
                        <div className="flex items-center space-x-2 mb-2">
                          <div 
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: targetNode.color }}
                          ></div>
                          <span className="font-medium text-sm">{targetNode.name}</span>
                          <span className="text-xs text-gray-400">
                            ({layers[targetNode.layer]?.name})
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 line-clamp-2">
                          {targetNode.description}
                        </p>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-gray-400 text-center py-12">
              <BookOpen className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg mb-2">探索知识图谱</p>
              <p className="text-sm">点击图谱中的节点查看详情</p>
              <p className="text-sm">点击关系链接查看推理依据</p>
            </div>
          )}

          <div className="mt-6 bg-gray-700 rounded-lg p-4">
            <h4 className="font-medium mb-3">图谱统计</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400">{currentData.nodes.length}</div>
                <div className="text-gray-400">总节点数</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">{currentData.links.length}</div>
                <div className="text-gray-400">关系连接</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-400">4</div>
                <div className="text-gray-400">知识层级</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-400">
                  {Math.round((currentData.links.length / (currentData.nodes.length * (currentData.nodes.length - 1) / 2)) * 100)}%
                </div>
                <div className="text-gray-400">连接密度</div>
              </div>
            </div>
            
            {/* 🔥 数据状态信息 */}
            {(() => {
              const hasLocalEdits = localStorage.getItem('knowledge-graph-edits') !== null;
              const originalNodeCount = layeredData.nodes.length;
              const originalLinkCount = layeredData.links.length;
              const nodesDiff = currentData.nodes.length - originalNodeCount;
              const linksDiff = currentData.links.length - originalLinkCount;
              
              return hasLocalEdits && (
                <div className="mt-4 pt-3 border-t border-gray-600">
                  <h5 className="text-sm font-medium mb-2 text-green-400">📝 编辑状态</h5>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-gray-800 rounded p-2">
                      <div className="text-gray-400">节点变化</div>
                      <div className={`font-bold ${nodesDiff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {nodesDiff >= 0 ? '+' : ''}{nodesDiff}
                      </div>
                    </div>
                    <div className="bg-gray-800 rounded p-2">
                      <div className="text-gray-400">连线变化</div>
                      <div className={`font-bold ${linksDiff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {linksDiff >= 0 ? '+' : ''}{linksDiff}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-gray-400">
                    💾 数据已自动保存到本地存储
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
      
      {/* 【新功能 & 交互修复】H5 模拟训练选择弹窗 */}
      {showH5SimModal && (
        <>
          <style>{`
            @keyframes fade-in-scale {
              from {
                opacity: 0;
                transform: scale(0.95);
              }
              to {
                opacity: 1;
                transform: scale(1);
              }
            }
            .animate-fade-in-scale {
              animation: fade-in-scale 0.3s ease-out forwards;
            }
          `}</style>
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-8 shadow-2xl max-w-md w-full border border-gray-700 animate-fade-in-scale">
              <h3 className="text-xl font-bold mb-4 text-white">选择一个模拟情景</h3>
              <p className="text-gray-400 mb-6">
                "品牌危机公关"有两个不同的模拟训练，请选择一个开始学习：
              </p>
              <div className="space-y-4">
                <button
                  onClick={() => {
                    const url = new URL('h5sim_20250613123918_20250613.html', window.location.href).href;
                    window.open(url, '_blank');
                    setShowH5SimModal(false);
                  }}
                  className="w-full text-left flex items-center space-x-4 px-4 py-3 rounded-lg transition-all duration-300 bg-gray-700 hover:bg-blue-600 hover:shadow-lg hover:shadow-blue-500/25 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <Zap className="w-6 h-6 text-blue-400 flex-shrink-0" />
                  <div>
                    <span className="font-semibold text-base">情景 A: 科技公司安全漏洞</span>
                    <p className="text-xs text-gray-400 mt-1">处理一款核心操作系统被爆出严重安全漏洞的危机。</p>
                  </div>
                </button>
                <button
                  onClick={() => {
                    const url = new URL('h5sim_20250613143612_20250613.html', window.location.href).href;
                    window.open(url, '_blank');
                    setShowH5SimModal(false);
                  }}
                  className="w-full text-left flex items-center space-x-4 px-4 py-3 rounded-lg transition-all duration-300 bg-gray-700 hover:bg-green-600 hover:shadow-lg hover:shadow-green-500/25 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <Zap className="w-6 h-6 text-green-400 flex-shrink-0" />
                  <div>
                    <span className="font-semibold text-base">情景 B: 消费品牌产品安全</span>
                    <p className="text-xs text-gray-400 mt-1">处理一款知名奶粉产品被检测出有害物质的危机。</p>
                  </div>
                </button>
              </div>
              <div className="mt-8 text-right">
                <button
                  onClick={() => setShowH5SimModal(false)}
                  className="px-5 py-2 rounded-lg transition-all duration-300 bg-gray-600 hover:bg-gray-500 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-400"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// 主包装器组件 - 提供编辑上下文
const LayeredKnowledgeGraph = () => {
  // 🔥 数据持久化：从localStorage恢复编辑数据或使用原始数据
  const initializeData = () => {
    try {
      const savedData = localStorage.getItem('knowledge-graph-edits');
      if (savedData) {
        const parsedData = JSON.parse(savedData);
        // 验证数据完整性
        if (parsedData.nodes && parsedData.links && Array.isArray(parsedData.nodes) && Array.isArray(parsedData.links)) {
          console.log('📦 已恢复保存的编辑数据:', {
            nodes: parsedData.nodes.length,
            links: parsedData.links.length
          });
          // 🔥 对恢复的数据也应用清理功能
          const cleanedData = cleanGraphData(parsedData);
          console.log('🧹 已清理恢复的编辑数据中的特殊符号');
          return cleanedData;
        }
      }
    } catch (error) {
      console.warn('⚠️ 恢复编辑数据失败，使用原始数据:', error);
      localStorage.removeItem('knowledge-graph-edits'); // 清除损坏的数据
    }
    
    console.log('📦 使用原始数据初始化');
    return layeredData;
  };

  const [graphData, setGraphData] = useState(initializeData);

  // 处理编辑数据变化
  const handleDataChange = useCallback((newData) => {
    setGraphData(newData);
    
    // 🔥 自动保存到localStorage
    try {
      localStorage.setItem('knowledge-graph-edits', JSON.stringify(newData));
      console.log('💾 编辑数据已自动保存到本地存储');
    } catch (error) {
      console.error('💥 保存编辑数据失败:', error);
      // 可以在这里添加用户提示
    }
  }, []);

  // 🔥 重置到原始数据
  const resetToOriginal = useCallback(() => {
    if (window.confirm('确定要重置到原始数据吗？这将丢失所有编辑！')) {
      setGraphData(layeredData);  // 🔥 layeredData已经是清理后的原始数据
      localStorage.removeItem('knowledge-graph-edits');
      console.log('🔄 已重置到原始数据');
    }
  }, []);

  // 🔥 手动导出编辑数据
  const exportEditedData = useCallback(() => {
    try {
      const dataBlob = new Blob([JSON.stringify(graphData, null, 2)], {
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
      console.log('📤 编辑数据已导出');
    } catch (error) {
      console.error('💥 导出失败:', error);
    }
  }, [graphData]);

  // 🔥 手动导入编辑数据
  const importEditedData = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const importedData = JSON.parse(event.target.result);
            if (importedData.nodes && importedData.links && Array.isArray(importedData.nodes) && Array.isArray(importedData.links)) {
              // 🔥 对导入的数据应用清理功能
              const cleanedData = cleanGraphData(importedData);
              console.log('🧹 已清理导入数据中的特殊符号');
              
              setGraphData(cleanedData);
              localStorage.setItem('knowledge-graph-edits', JSON.stringify(cleanedData));
              console.log('📤 编辑数据已导入并保存');
            } else {
              alert('无效的数据格式！');
            }
          } catch (error) {
            console.error('💥 导入失败:', error);
            alert('导入失败：文件格式错误！');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }, []);

  return (
    <EditProvider initialData={graphData}>
      <div className="relative w-full h-screen">
        <LayeredKnowledgeGraphInner 
          graphData={graphData} 
          resetToOriginal={resetToOriginal}
          exportEditedData={exportEditedData}
          importEditedData={importEditedData}
        />
        <EditToolbar onDataChange={handleDataChange} currentGraphData={graphData} />
      </div>
    </EditProvider>
  );
};

export default LayeredKnowledgeGraph;