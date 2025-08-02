class ClipMerge {
    constructor() {
        this.selectedFiles = [];
        this.mergedVideoBlob = null;
        this.initializeElements();
        this.bindEvents();
    }

    initializeElements() {
        this.videoInput = document.getElementById('videoInput');
        this.fileList = document.getElementById('fileList');
        this.mergeButton = document.getElementById('mergeButton');
        this.progressSection = document.getElementById('progressSection');
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');
        this.statusMessage = document.getElementById('statusMessage');
        this.previewSection = document.getElementById('previewSection');
        this.previewVideo = document.getElementById('previewVideo');
        this.downloadSection = document.getElementById('downloadSection');
        this.downloadButton = document.getElementById('downloadButton');
    }

    bindEvents() {
        this.videoInput.addEventListener('change', (e) => this.handleFileSelection(e));
        this.mergeButton.addEventListener('click', () => this.mergeVideos());
    }

    handleFileSelection(event) {
        const files = Array.from(event.target.files);
        
        if (files.length === 0) return;

        // 動画ファイルのみをフィルタリング
        const videoFiles = files.filter(file => file.type.startsWith('video/'));
        
        if (videoFiles.length === 0) {
            this.showStatus('動画ファイルを選択してください。', 'error');
            return;
        }

        // 新しいファイルを追加
        this.selectedFiles = this.selectedFiles.concat(videoFiles);
        this.updateFileList();
        this.updateMergeButton();
        this.showStatus(`${videoFiles.length}個の動画ファイルが追加されました。`, 'success');
    }

    updateFileList() {
        if (this.selectedFiles.length === 0) {
            this.fileList.innerHTML = `
                <li style="text-align: center; color: #999; padding: 20px;">
                    ファイルが選択されていません
                </li>
            `;
            return;
        }

        this.fileList.innerHTML = this.selectedFiles.map((file, index) => `
            <li class="file-item">
                <div class="file-info">
                    <div class="file-icon">🎬</div>
                    <div class="file-details">
                        <h4>${file.name}</h4>
                        <p>${this.formatFileSize(file.size)} • ${file.type}</p>
                    </div>
                </div>
                <button class="remove-file" onclick="clipMerge.removeFile(${index})">
                    ✕
                </button>
            </li>
        `).join('');
    }

    removeFile(index) {
        this.selectedFiles.splice(index, 1);
        this.updateFileList();
        this.updateMergeButton();
        this.showStatus('ファイルが削除されました。', 'info');
    }

    updateMergeButton() {
        this.mergeButton.disabled = this.selectedFiles.length < 2;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    showStatus(message, type = 'info') {
        this.statusMessage.innerHTML = `<div class="status-message status-${type}">${message}</div>`;
        setTimeout(() => {
            this.statusMessage.innerHTML = '';
        }, 5000);
    }

    async mergeVideos() {
        if (this.selectedFiles.length < 2) {
            this.showStatus('結合するには少なくとも2つの動画ファイルが必要です。', 'error');
            return;
        }

        this.mergeButton.disabled = true;
        this.progressSection.classList.remove('hidden');
        this.updateProgress(0, '動画ファイルを読み込み中...');

        try {
            // 各動画ファイルを読み込み
            const videoElements = await this.loadVideos();
            this.updateProgress(30, '動画を結合中...');

            // Canvasを使用して動画を結合
            const mergedBlob = await this.mergeVideosWithCanvas(videoElements);
            this.updateProgress(80, '最終処理中...');

            // 結合された動画を保存
            this.mergedVideoBlob = mergedBlob;
            this.updateProgress(100, '完了！');

            // プレビューとダウンロードボタンを表示
            this.showPreview();
            this.showDownloadButton();
            this.showStatus('動画の結合が完了しました！', 'success');

        } catch (error) {
            console.error('動画結合エラー:', error);
            this.showStatus('動画の結合中にエラーが発生しました。', 'error');
        } finally {
            this.mergeButton.disabled = false;
            setTimeout(() => {
                this.progressSection.classList.add('hidden');
            }, 2000);
        }
    }

    async loadVideos() {
        const videoPromises = this.selectedFiles.map((file, index) => {
            return new Promise((resolve, reject) => {
                const video = document.createElement('video');
                video.muted = true;
                video.crossOrigin = 'anonymous';
                video.preload = 'metadata';
                
                video.addEventListener('loadedmetadata', () => {
                    resolve(video);
                });
                
                video.addEventListener('error', () => {
                    reject(new Error(`動画ファイル ${file.name} の読み込みに失敗しました。`));
                });

                // 動画のURLを作成して設定
                const videoUrl = URL.createObjectURL(file);
                video.src = videoUrl;
            });
        });

        return Promise.all(videoPromises);
    }



    async mergeVideosWithCanvas(videoElements) {
        return new Promise((resolve, reject) => {
            try {
                // 最初の動画のアスペクト比を基準にする
                const firstVideo = videoElements[0];
                const targetWidth = firstVideo.videoWidth;
                const targetHeight = firstVideo.videoHeight;
                const fps = 30;

                // Canvasを作成
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = targetWidth;
                canvas.height = targetHeight;

                // MediaRecorderを使用して動画を録画
                const stream = canvas.captureStream(fps);
                
                // QuickTime互換のMP4形式を優先、フォールバックとしてWebM
                const supportedTypes = [
                    'video/mp4;codecs=h264',
                    'video/mp4;codecs=avc1',
                    'video/webm;codecs=vp9',
                    'video/webm;codecs=vp8',
                    'video/webm'
                ];
                
                let mimeType = 'video/webm';
                for (const type of supportedTypes) {
                    if (MediaRecorder.isTypeSupported(type)) {
                        mimeType = type;
                        break;
                    }
                }
                
                const mediaRecorder = new MediaRecorder(stream, {
                    mimeType: mimeType
                });

                const chunks = [];
                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        chunks.push(event.data);
                    }
                };

                mediaRecorder.onstop = () => {
                    const blob = new Blob(chunks, { type: mimeType });
                    resolve(blob);
                };

                mediaRecorder.start();

                // 動画を順番に再生してCanvasに描画
                this.playVideosSequentially(videoElements, ctx, canvas, mediaRecorder, targetWidth, targetHeight, resolve, reject);

            } catch (error) {
                reject(error);
            }
        });
    }

    async playVideosSequentially(videoElements, ctx, canvas, mediaRecorder, targetWidth, targetHeight, resolve, reject) {
        try {
            for (let i = 0; i < videoElements.length; i++) {
                const video = videoElements[i];
                
                // 動画の読み込みを待つ
                await new Promise((resolveVideo) => {
                    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
                        resolveVideo();
                    } else {
                        const checkReady = () => {
                            if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
                                resolveVideo();
                            }
                        };
                        video.addEventListener('loadedmetadata', checkReady, { once: true });
                        video.addEventListener('canplay', checkReady, { once: true });
                    }
                });

                // 動画を再生
                video.currentTime = 0;
                
                // 動画の再生開始を待つ
                await new Promise((resolvePlay) => {
                    video.addEventListener('play', resolvePlay, { once: true });
                    video.play();
                });

                // 動画の最初のフレームが利用可能になるまで待つ
                await new Promise((resolveFrame) => {
                    const checkFrame = () => {
                        if (video.readyState >= 2 && !video.paused && !video.ended) {
                            resolveFrame();
                        }
                    };
                    video.addEventListener('canplaythrough', checkFrame, { once: true });
                    // 少し遅延を追加
                    setTimeout(checkFrame, 50);
                });

                // 動画の長さ分だけCanvasに描画
                const duration = video.duration;
                const startTime = Date.now();

                const drawFrame = () => {
                    if (video.ended || video.paused) {
                        if (i === videoElements.length - 1) {
                            // 最後の動画が終了したら録画を停止
                            setTimeout(() => {
                                mediaRecorder.stop();
                            }, 100);
                        }
                        return;
                    }

                    // 動画の準備状態をチェック
                    if (video.readyState < 2) {
                        requestAnimationFrame(drawFrame);
                        return;
                    }

                    // 最初の動画の大きい方に合わせてスケーリング（アスペクト比保持）
                    const videoAspectRatio = video.videoWidth / video.videoHeight;
                    const targetAspectRatio = targetWidth / targetHeight;
                    
                    let drawWidth, drawHeight, offsetX, offsetY;
                    
                    if (videoAspectRatio > targetAspectRatio) {
                        // 動画が横長の場合、幅に合わせてスケーリング
                        drawWidth = targetWidth;
                        drawHeight = drawWidth / videoAspectRatio;
                        offsetX = 0;
                        offsetY = (targetHeight - drawHeight) / 2;
                    } else {
                        // 動画が縦長の場合、高さに合わせてスケーリング
                        drawHeight = targetHeight;
                        drawWidth = drawHeight * videoAspectRatio;
                        offsetX = (targetWidth - drawWidth) / 2;
                        offsetY = 0;
                    }
                    
                    // 背景を黒で塗りつぶし
                    ctx.fillStyle = '#000000';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    
                    // 動画フレームをCanvasに描画（アスペクト比を保持してセンタリング）
                    try {
                        ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);
                    } catch (error) {
                        console.log('描画エラー:', error);
                    }
                    
                    requestAnimationFrame(drawFrame);
                };

                // 最初のフレームを即座に描画
                drawFrame();

                // 少し待ってから動画の長さ分だけ待機
                await new Promise(resolve => {
                    setTimeout(resolve, 100); // 最初のフレーム描画のための短い遅延
                });

                // 動画の長さ分だけ待機
                await new Promise(resolve => {
                    setTimeout(resolve, duration * 1000);
                });
            }
        } catch (error) {
            reject(error);
        }
    }

    updateProgress(percentage, text) {
        this.progressFill.style.width = `${percentage}%`;
        this.progressText.textContent = text;
    }

    showPreview() {
        if (this.mergedVideoBlob) {
            const videoUrl = URL.createObjectURL(this.mergedVideoBlob);
            this.previewVideo.src = videoUrl;
            this.previewSection.classList.remove('hidden');
        }
    }

    showDownloadButton() {
        if (this.mergedVideoBlob) {
            const videoUrl = URL.createObjectURL(this.mergedVideoBlob);
            this.downloadButton.href = videoUrl;
            
            // 動画形式に応じてファイル名を設定
            const isMP4 = this.mergedVideoBlob.type.includes('mp4');
            const fileName = isMP4 ? 'merged_video.mp4' : 'merged_video.webm';
            this.downloadButton.download = fileName;
            
            this.downloadSection.classList.remove('hidden');
        }
    }
}

// アプリケーションの初期化
let clipMerge;
document.addEventListener('DOMContentLoaded', () => {
    clipMerge = new ClipMerge();
}); 