figma.showUI(__html__, { width: 420, height: 720 });

figma.ui.onmessage = (msg) => {
  if (msg.type === 'close') {
    figma.closePlugin();
  }
};
