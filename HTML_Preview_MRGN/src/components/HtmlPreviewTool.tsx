import { useState, useRef } from "react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Label } from "./ui/label";
import { Monitor, Smartphone, Tablet, Upload, Share2, Download, FileArchive, X, Trash2 } from "lucide-react";
import { toast } from "sonner@2.0.3";
import JSZip from "jszip";

type FormatContent = {
  html: string;
  assets: Map<string, string>; // filename -> data URL
  width: number;
  height: number;
  name: string;
};

export function HtmlPreviewTool() {
  const [formatContents, setFormatContents] = useState<Map<string, FormatContent>>(new Map());
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);
  const [showMultiView, setShowMultiView] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const detectDimensions = (htmlContent: string, filename: string): { width: number; height: number; name: string } => {
    let width = 0;
    let height = 0;
    let name = "";

    // PRIORITY: Try to detect from ad.size meta tag (common in ad formats)
    const adSizeMatch = htmlContent.match(/<meta\s+name=["']ad\.size["']\s+content=["']([^"']+)["']/i);
    if (adSizeMatch) {
      const content = adSizeMatch[1];
      const widthMatch = content.match(/width=(\d+)/i);
      const heightMatch = content.match(/height=(\d+)/i);
      if (widthMatch && heightMatch) {
        width = parseInt(widthMatch[1]);
        height = parseInt(heightMatch[1]);
      }
    }

    // Try to detect from viewport meta tag with specific width/height
    if (!width || !height) {
      const viewportMatch = htmlContent.match(/<meta\s+name=["']viewport["']\s+content=["']([^"']+)["']/i);
      if (viewportMatch) {
        const content = viewportMatch[1];
        const widthMatch = content.match(/width=(\d+)/i);
        const heightMatch = content.match(/height=(\d+)/i);
        if (widthMatch && heightMatch) {
          width = parseInt(widthMatch[1]);
          height = parseInt(heightMatch[1]);
        }
      }
    }

    // Try to detect from body tag with inline styles
    if (!width || !height) {
      const bodyStyleMatch = htmlContent.match(/<body[^>]*style=["']([^"']*width:\s*(\d+)px[^"']*height:\s*(\d+)px[^"']*)["']/i);
      if (bodyStyleMatch) {
        width = parseInt(bodyStyleMatch[2]);
        height = parseInt(bodyStyleMatch[3]);
      } else {
        const bodyStyleMatch2 = htmlContent.match(/<body[^>]*style=["']([^"']*height:\s*(\d+)px[^"']*width:\s*(\d+)px[^"']*)["']/i);
        if (bodyStyleMatch2) {
          height = parseInt(bodyStyleMatch2[2]);
          width = parseInt(bodyStyleMatch2[3]);
        }
      }
    }

    // Try to detect from html tag with inline styles
    if (!width || !height) {
      const htmlStyleMatch = htmlContent.match(/<html[^>]*style=["']([^"']*width:\s*(\d+)px[^"']*height:\s*(\d+)px[^"']*)["']/i);
      if (htmlStyleMatch) {
        width = parseInt(htmlStyleMatch[2]);
        height = parseInt(htmlStyleMatch[3]);
      }
    }

    // Try to detect from style tag for body/html dimensions
    if (!width || !height) {
      const styleTagMatch = htmlContent.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
      if (styleTagMatch) {
        const cssContent = styleTagMatch[1];
        const bodyWidthMatch = cssContent.match(/body\s*\{[^}]*width:\s*(\d+)px/i);
        const bodyHeightMatch = cssContent.match(/body\s*\{[^}]*height:\s*(\d+)px/i);
        if (bodyWidthMatch) width = parseInt(bodyWidthMatch[1]);
        if (bodyHeightMatch) height = parseInt(bodyHeightMatch[1]);
        
        // Also check html selector
        if (!width || !height) {
          const htmlWidthMatch = cssContent.match(/html\s*\{[^}]*width:\s*(\d+)px/i);
          const htmlHeightMatch = cssContent.match(/html\s*\{[^}]*height:\s*(\d+)px/i);
          if (htmlWidthMatch) width = parseInt(htmlWidthMatch[1]);
          if (htmlHeightMatch) height = parseInt(htmlHeightMatch[1]);
        }
      }
    }

    // Try to detect from main container div with inline styles (common in ad formats)
    if (!width || !height) {
      const divStyleMatch = htmlContent.match(/<div[^>]*style=["']([^"']*width:\s*(\d+)px[^"']*height:\s*(\d+)px[^"']*)["']/i);
      if (divStyleMatch) {
        width = parseInt(divStyleMatch[2]);
        height = parseInt(divStyleMatch[3]);
      }
    }

    // Try to detect dimensions from HTML comments or data attributes
    if (!width || !height) {
      const commentMatch = htmlContent.match(/<!--\s*(?:size|dimensions|format):\s*(\d+)\s*[x×]\s*(\d+)\s*-->/i);
      if (commentMatch) {
        width = parseInt(commentMatch[1]);
        height = parseInt(commentMatch[2]);
      }
    }

    // Try data-format attribute
    if (!width || !height) {
      const dataFormatMatch = htmlContent.match(/data-format=["']([^"']+)["']/i);
      if (dataFormatMatch) {
        const formatMatch = dataFormatMatch[1].match(/(\d+)\s*[x×]\s*(\d+)/i);
        if (formatMatch) {
          width = parseInt(formatMatch[1]);
          height = parseInt(formatMatch[2]);
        }
      }
    }

    // Try to detect from filename patterns
    if (!width || !height) {
      const dimensionMatch = filename.match(/(\d+)[x×_-](\d+)/i);
      if (dimensionMatch) {
        width = parseInt(dimensionMatch[1]);
        height = parseInt(dimensionMatch[2]);
      }
    }

    // If still no dimensions found, use reasonable defaults
    if (!width || !height) {
      width = 800;
      height = 600;
    }

    // Extract name from title tag
    const titleMatch = htmlContent.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) {
      name = titleMatch[1].trim();
    }

    // If no name from title, try meta name or description
    if (!name) {
      const metaNameMatch = htmlContent.match(/<meta\s+name=["'](?:format-name|display-name)["']\s+content=["']([^"']+)["']/i);
      if (metaNameMatch) {
        name = metaNameMatch[1].trim();
      }
    }

    // If still no name, check filename
    if (!name) {
      const cleanFilename = filename.replace(/\.html$/, '').replace(/[_-]/g, ' ');
      // Check for common format names in filename
      const lowerFilename = cleanFilename.toLowerCase();
      if (lowerFilename.includes('mobile') && lowerFilename.includes('portrait')) {
        name = 'Mobile Portrait';
      } else if (lowerFilename.includes('mobile') && lowerFilename.includes('landscape')) {
        name = 'Mobile Landscape';
      } else if (lowerFilename.includes('tablet') && lowerFilename.includes('portrait')) {
        name = 'Tablet Portrait';
      } else if (lowerFilename.includes('tablet') && lowerFilename.includes('landscape')) {
        name = 'Tablet Landscape';
      } else if (lowerFilename.includes('desktop')) {
        name = 'Desktop';
      } else {
        name = cleanFilename;
      }
    }

    // Add dimensions to name if not already present
    if (name && !name.match(/\d+\s*[x×]\s*\d+/)) {
      name = `${name} (${width}×${height})`;
    } else if (!name) {
      name = `${width}×${height}`;
    }

    return { width, height, name };
  };

  const processZipFile = async (file: File) => {
    if (!file.name.endsWith(".zip")) {
      toast.error("Please upload a ZIP file");
      return;
    }

    try {
      const zip = new JSZip();
      const contents = await zip.loadAsync(file);
      
      let htmlFile: string | null = null;
      let htmlContent = "";
      const assets = new Map<string, string>();

      // Find HTML file and extract assets
      for (const [filename, zipEntry] of Object.entries(contents.files)) {
        if (zipEntry.dir) continue;

        if (filename.endsWith(".html") && !htmlFile) {
          htmlFile = filename;
          htmlContent = await zipEntry.async("text");
        } else {
          // Handle assets (images, CSS, JS, SVG, etc.)
          const basename = filename.split('/').pop() || filename;
          
          // Skip hidden files and system files
          if (basename.startsWith('.') || basename.startsWith('__MACOSX')) {
            continue;
          }
          
          const blob = await zipEntry.async("blob");
          
          // Ensure correct MIME type for SVG files
          let finalBlob = blob;
          if (basename.toLowerCase().endsWith('.svg')) {
            finalBlob = new Blob([blob], { type: 'image/svg+xml' });
          }
          
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsDataURL(finalBlob);
          });
          
          // Store with basename as key
          assets.set(basename, dataUrl);
          console.log(`✓ Loaded asset: "${basename}" (${finalBlob.type || 'unknown type'})`);
        }
      }

      if (!htmlFile) {
        toast.error("No HTML file found in the ZIP");
        return;
      }

      // Detect dimensions and format name
      const { width, height, name } = detectDimensions(htmlContent, htmlFile);

      console.log("Original HTML snippet:", htmlContent.substring(0, 500));
      console.log("Assets loaded:", Array.from(assets.keys()));

      // Replace asset references in HTML with data URLs
      let processedHtml = htmlContent;
      assets.forEach((dataUrl, filename) => {
        // Escape special regex characters in filename
        const escapedFilename = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Create comprehensive replacement patterns
        // Match: src="filename", src='filename', src="./filename", src="path/filename"
        const patterns = [
          new RegExp(`(src|href)=["']([^"']*[/\\\\])?${escapedFilename}["']`, "gi"),
          new RegExp(`(src|href)=["']${escapedFilename}["']`, "gi"),
        ];
        
        patterns.forEach(pattern => {
          const matches = processedHtml.match(pattern);
          if (matches) {
            console.log(`Found matches for ${filename}:`, matches);
          }
          processedHtml = processedHtml.replace(pattern, `$1="${dataUrl}"`);
        });
      });

      console.log("Processed HTML snippet:", processedHtml.substring(0, 500));

      const formatKey = `${name}_${Date.now()}`;
      setFormatContents((prev) => {
        const newMap = new Map(prev);
        newMap.set(formatKey, { html: processedHtml, assets, width, height, name });
        return newMap;
      });

      if (!selectedFormat) {
        setSelectedFormat(formatKey);
      }

      toast.success(`${name} loaded with ${assets.size} assets!`);
    } catch (error) {
      console.error("Error processing ZIP:", error);
      toast.error("Failed to process ZIP file");
    }
  };

  const handleZipUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      await processZipFile(files[i]);
    }
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);

    const files = event.dataTransfer.files;
    for (let i = 0; i < files.length; i++) {
      await processZipFile(files[i]);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const removeFormat = (formatKey: string) => {
    setFormatContents((prev) => {
      const newMap = new Map(prev);
      newMap.delete(formatKey);
      return newMap;
    });
    
    if (selectedFormat === formatKey) {
      const remaining = Array.from(formatContents.keys()).filter(k => k !== formatKey);
      setSelectedFormat(remaining.length > 0 ? remaining[0] : null);
    }
    
    toast.success("Format removed");
  };

  const clearAll = () => {
    setFormatContents(new Map());
    setSelectedFormat(null);
    toast.success("All formats cleared");
  };

  const handleShare = async () => {
    if (formatContents.size === 0) {
      toast.error("No content to share");
      return;
    }
    
    const content = selectedFormat ? formatContents.get(selectedFormat)?.html : formatContents.values().next().value?.html;
    if (!content) return;
    
    const blob = new Blob([content], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Preview URL copied to clipboard!");
    } catch (err) {
      toast.error("Failed to copy URL");
    }
  };

  const handleDownload = () => {
    if (formatContents.size === 0) {
      toast.error("No content to download");
      return;
    }

    const format = selectedFormat ? formatContents.get(selectedFormat) : formatContents.values().next().value;
    if (!format) return;

    const blob = new Blob([format.html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${format.name}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("HTML file downloaded!");
  };

  const getIcon = (width: number) => {
    if (width <= 480) return Smartphone;
    if (width <= 1024) return Tablet;
    return Monitor;
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-slate-900 mb-2">HTML Display Preview Tool</h1>
        <p className="text-slate-600">Upload ZIP files containing HTML and assets for different display formats</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Upload & Formats */}
        <Card className="lg:col-span-1 p-6">
          <div className="space-y-6">
            {/* Upload Zone */}
            <div>
              <Label className="mb-3 block">Upload Display Formats</Label>
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer ${
                  isDragging
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
                }`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className={`size-12 mx-auto mb-4 ${isDragging ? "text-blue-500" : "text-slate-400"}`} />
                <p className="text-slate-600 mb-2">
                  {isDragging ? "Drop ZIP files here" : "Drag & drop ZIP files here"}
                </p>
                <p className="text-slate-500 text-sm mb-4">or click to browse</p>
                <Button type="button" variant="outline" onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}>
                  <FileArchive className="size-4 mr-2" />
                  Choose Files
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip,application/zip"
                  multiple
                  onChange={handleZipUpload}
                  className="hidden"
                />
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Each ZIP should contain an HTML file and its assets. Dimensions will be auto-detected from filenames or viewport meta tags.
              </p>
            </div>

            {/* Uploaded Formats List */}
            {formatContents.size > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Loaded Formats ({formatContents.size})</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAll}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="size-4 mr-1" />
                    Clear All
                  </Button>
                </div>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {Array.from(formatContents.entries()).map(([formatKey, format]) => {
                    const Icon = getIcon(format.width);
                    const isSelected = selectedFormat === formatKey;
                    return (
                      <div
                        key={formatKey}
                        className={`flex items-center justify-between p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          isSelected
                            ? "border-blue-500 bg-blue-50"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                        onClick={() => setSelectedFormat(formatKey)}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Icon className={`size-5 flex-shrink-0 ${isSelected ? "text-blue-600" : "text-slate-600"}`} />
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm truncate ${isSelected ? "text-blue-900" : "text-slate-900"}`}>
                              {format.name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {format.width}×{format.height} • {format.assets.size} assets
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFormat(formatKey);
                          }}
                          className="flex-shrink-0"
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* View Toggle */}
            {formatContents.size > 1 && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowMultiView(!showMultiView)}
              >
                {showMultiView ? "Single View" : "Show All Formats"}
              </Button>
            )}

            {/* Actions */}
            {formatContents.size > 0 && (
              <div className="pt-6 border-t space-y-2">
                <Button className="w-full" onClick={handleShare} variant="outline">
                  <Share2 className="size-4 mr-2" />
                  Share Preview
                </Button>
                <Button className="w-full" onClick={handleDownload} variant="outline">
                  <Download className="size-4 mr-2" />
                  Download HTML
                </Button>
              </div>
            )}
          </div>
        </Card>

        {/* Right Panel - Preview */}
        <div className="lg:col-span-2">
          <Card className="mb-4 p-4">
            <h2 className="text-slate-900">Preview</h2>
            {formatContents.size > 0 && (
              <p className="text-slate-600">
                {showMultiView
                  ? `Viewing all ${formatContents.size} formats`
                  : selectedFormat && formatContents.get(selectedFormat)
                  ? `${formatContents.get(selectedFormat)!.name.replace(/\s*\(\d+×\d+\)/, '')} - ${formatContents.get(selectedFormat)!.width}×${formatContents.get(selectedFormat)!.height}px`
                  : "Select a format to preview"}
              </p>
            )}
          </Card>

          {formatContents.size === 0 ? (
            <div className="flex items-center justify-center h-[600px] bg-slate-100 rounded-lg border-2 border-dashed border-slate-300">
              <div className="text-center">
                <FileArchive className="size-16 mx-auto mb-4 text-slate-400" />
                <p className="text-slate-600">No formats uploaded</p>
                <p className="text-slate-500 text-sm">Upload ZIP files to preview your display formats</p>
              </div>
            </div>
          ) : showMultiView ? (
            <div className="space-y-6">
              {Array.from(formatContents.entries()).map(([formatKey, format]) => {
                const Icon = getIcon(format.width);
                return (
                  <div key={formatKey} className="space-y-2">
                    <div className="flex items-center gap-2 text-slate-700">
                      <Icon className="size-4" />
                      <span>{format.name}</span>
                      <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded">
                        {format.assets.size} assets
                      </span>
                    </div>
                    <div className="inline-block">
                      <div
                        className="border border-slate-300 shadow-sm"
                        style={{
                          width: `${format.width}px`,
                          height: `${format.height}px`,
                        }}
                      >
                        <iframe
                          srcDoc={format.html}
                          title={`Preview ${format.name}`}
                          sandbox="allow-scripts"
                          style={{
                            width: `${format.width}px`,
                            height: `${format.height}px`,
                            display: "block",
                            border: "none",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : selectedFormat && formatContents.has(selectedFormat) ? (
            <div className="inline-block">
              <div
                className="border border-slate-300 shadow-sm"
                style={{
                  width: `${formatContents.get(selectedFormat)!.width}px`,
                  height: `${formatContents.get(selectedFormat)!.height}px`,
                }}
              >
                <iframe
                  srcDoc={formatContents.get(selectedFormat)!.html}
                  title="HTML Preview"
                  sandbox="allow-scripts"
                  style={{
                    width: `${formatContents.get(selectedFormat)!.width}px`,
                    height: `${formatContents.get(selectedFormat)!.height}px`,
                    display: "block",
                    border: "none",
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}