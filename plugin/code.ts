figma.showUI(__html__, { width: 400, height: 600 });

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'cancel') {
    figma.closePlugin();
  } else if (msg.type === 'get-selection') {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      figma.ui.postMessage({ pluginMessage: { type: 'selection-images', images: [] } });
      return;
    }
    
    const images = await Promise.all(
      selection.map(async (node) => {
        try {
          const bytes = await node.exportAsync({ format: 'PNG', constraint: { max: 1024 } });
          return figma.base64Encode(bytes);
        } catch (error) {
          console.error('Failed to export node:', error);
          return null;
        }
      })
    );
    
    const validImages = images.filter((img): img is string => img !== null);
    figma.ui.postMessage({ pluginMessage: { type: 'selection-images', images: validImages } });
  }
};
