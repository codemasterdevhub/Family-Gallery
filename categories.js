document.addEventListener('DOMContentLoaded', () => {
    // Check if user is logged in
    if (!localStorage.getItem('isLoggedIn')) {
        window.location.href = 'index.html';
    }

    // Initialize albums and notes from server
    let albums = [];
    let notes = [];
    
    const albumFilters = document.getElementById('albumFilters');
    const gallery = document.getElementById('gallery');
    const albumModal = document.getElementById('albumModal');
    const addAlbumBtn = document.getElementById('addAlbumBtn');
    const closeModal = document.querySelector('.close-modal');
    const albumForm = document.getElementById('albumForm');
    const cancelBtn = document.querySelector('.cancel-btn');
    const photoModal = document.getElementById('photoModal');
    const uploadArea = document.getElementById('uploadArea');
    const photoPreview = document.getElementById('photoPreview');
    const photoInput = document.getElementById('albumPhotos');
    const saveBtn = document.querySelector('.save-btn');
    const notesGrid = document.getElementById('notesGrid');
    const noteModal = document.getElementById('noteModal');
    const noteViewModal = document.getElementById('noteViewModal');
    const noteForm = document.getElementById('noteForm');
    const addNoteBtn = document.getElementById('addNoteBtn');
    const editNoteBtn = document.getElementById('editNoteBtn');
    const deleteNoteBtn = document.getElementById('deleteNoteBtn');
    let currentNote = null;

    let activeAlbum = 'all';
    let currentPhotos = [];
    let currentPhotoIndex = 0;
    let isUploading = false;

    // Debug logging
    console.log('Initial albums data:', albums);
    console.log('Add Album Button:', addAlbumBtn);
    console.log('Album Modal:', albumModal);

    // Ensure the button and modal exist
    if (!addAlbumBtn || !albumModal) {
        console.error('Required elements not found');
        return;
    }

    // Function to get current user
    function getCurrentUser() {
        if (localStorage.getItem('isAdmin') === 'true') {
            return 'admin';
        }
        return localStorage.getItem('lastLoginUser') || 'user';
    }

    // Function to show loading state
    function setLoading(isLoading) {
        isUploading = isLoading;
        saveBtn.disabled = isLoading;
        saveBtn.innerHTML = isLoading ? 
            '<i class="fas fa-spinner fa-spin"></i> Creating...' : 
            'Create Album';
        uploadArea.style.pointerEvents = isLoading ? 'none' : 'auto';
    }

    // Function to show notification
    function showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
            ${message}
        `;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // Function to load data from localStorage
    async function loadData() {
        try {
            const storedAlbums = localStorage.getItem('albums');
            const storedNotes = localStorage.getItem('notes');
            albums = storedAlbums ? JSON.parse(storedAlbums) : [];
            notes = storedNotes ? JSON.parse(storedNotes) : [];
            
            // Update UI
            updateAlbumFilters();
            updateGallery();
            updateNotesGrid();
        } catch (error) {
            console.error('Error loading data:', error);
            showNotification('Error loading data. Please refresh the page.', 'error');
        }
    }

    // Function to save albums to localStorage
    async function saveAlbums() {
        try {
            localStorage.setItem('albums', JSON.stringify(albums));
            return true;
        } catch (error) {
            console.error('Error saving albums:', error);
            showNotification('Error saving albums. Please try again.', 'error');
            return false;
        }
    }

    // Function to save notes to localStorage
    async function saveNotes() {
        try {
            localStorage.setItem('notes', JSON.stringify(notes));
            return true;
        } catch (error) {
            console.error('Error saving notes:', error);
            showNotification('Error saving notes. Please try again.', 'error');
            return false;
        }
    }

    // Function to delete album
    async function deleteAlbum(albumName) {
        albums = albums.filter(album => album.name !== albumName);
        if (await saveAlbums()) {
            updateAlbumFilters();
            updateGallery();
            showNotification('Album deleted successfully');
        }
    }

    // Function to check available storage
    async function checkStorageQuota() {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            try {
                const {usage, quota} = await navigator.storage.estimate();
                const availableSpace = quota - usage;
                return {
                    available: availableSpace,
                    total: quota,
                    used: usage
                };
            } catch (error) {
                console.error('Error checking storage:', error);
                return null;
            }
        }
        return null;
    }

    // Function to handle photo/video upload
    async function handlePhotoUpload(files) {
        if (isUploading) return;

        const validFiles = Array.from(files).filter(file => {
            if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
                showNotification(`${file.name} is not a valid image or video file`, 'error');
                return false;
            }
            return true;
        });

        if (validFiles.length === 0) return;

        setLoading(true);
        let loadedCount = 0;

        // Check available storage
        const storageInfo = await checkStorageQuota();
        if (storageInfo) {
            const newFilesTotalSize = validFiles.reduce((total, file) => total + file.size, 0);
            const currentStorageUsage = currentPhotos.reduce((total, photo) => total + (photo.size || 0), 0);
            
            if (currentStorageUsage + newFilesTotalSize > storageInfo.available) {
                const availableGB = (storageInfo.available / (1024 * 1024 * 1024)).toFixed(2);
                showNotification(`Not enough storage space. Only ${availableGB}GB available.`, 'error');
                setLoading(false);
                return;
            }
        }

        // Process files in batches to prevent memory issues
        const processFile = (file, index) => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    if (file.type.startsWith('image/')) {
                        // Handle image files
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            let MAX_WIDTH = 3840; // 4K resolution
                            let MAX_HEIGHT = 3840;
                            let quality = 0.95; // High quality

                            // Calculate dimensions while maintaining aspect ratio
                            let width = img.width;
                            let height = img.height;

                            if (width > height) {
                                if (width > MAX_WIDTH) {
                                    height *= MAX_WIDTH / width;
                                    width = MAX_WIDTH;
                                }
                            } else {
                                if (height > MAX_HEIGHT) {
                                    width *= MAX_HEIGHT / height;
                                    height = MAX_HEIGHT;
                                }
                            }

                            // Progressive quality reduction
                            const compressImage = (targetQuality) => {
                                canvas.width = width;
                                canvas.height = height;
                                const ctx = canvas.getContext('2d');
                                ctx.drawImage(img, 0, 0, width, height);
                                return canvas.toDataURL('image/jpeg', targetQuality);
                            };

                            // Try different quality levels
                            let compressedDataUrl = compressImage(quality);
                            let compressedSize = Math.round((compressedDataUrl.length - 22) * 3 / 4);

                            // Only compress if the compressed size is larger than original
                            if (compressedSize > file.size) {
                                quality = 0.9;
                                compressedDataUrl = compressImage(quality);
                                compressedSize = Math.round((compressedDataUrl.length - 22) * 3 / 4);

                                if (compressedSize > file.size) {
                                    quality = 0.85;
                                    compressedDataUrl = compressImage(quality);
                                }
                            }

                            currentPhotos.push({
                                type: 'image',
                                url: compressedDataUrl,
                                name: file.name,
                                size: compressedSize,
                                originalSize: file.size,
                                width: width,
                                height: height
                            });
                            loadedCount++;
                            
                            if (loadedCount === validFiles.length) {
                                setLoading(false);
                                updatePhotoPreview();
                                showNotification(`Added ${validFiles.length} file(s)`);
                            }
                            resolve();
                        };
                        img.onerror = reject;
                        img.src = e.target.result;
                    } else if (file.type.startsWith('video/')) {
                        // Handle video files
                        const video = document.createElement('video');
                        video.preload = 'metadata';
                        video.onloadedmetadata = () => {
                            // Check if we have enough storage for the video
                            if (storageInfo && file.size > storageInfo.available) {
                                const availableGB = (storageInfo.available / (1024 * 1024 * 1024)).toFixed(2);
                                showNotification(`Not enough storage space for video. Only ${availableGB}GB available.`, 'error');
                                loadedCount++;
                                if (loadedCount === validFiles.length) {
                                    setLoading(false);
                                }
                                resolve();
                                return;
                            }

                            const videoUrl = e.target.result;
                            currentPhotos.push({
                                type: 'video',
                                url: videoUrl,
                                name: file.name,
                                size: file.size,
                                duration: video.duration,
                                width: video.videoWidth,
                                height: video.videoHeight
                            });
                            loadedCount++;
                            
                            if (loadedCount === validFiles.length) {
                                setLoading(false);
                                updatePhotoPreview();
                                showNotification(`Added ${validFiles.length} file(s)`);
                            }
                            resolve();
                        };
                        video.onerror = reject;
                        video.src = e.target.result;
                    }
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        };

        // Process files sequentially
        const processFiles = async () => {
            for (let i = 0; i < validFiles.length; i++) {
                try {
                    await processFile(validFiles[i], i);
                } catch (error) {
                    console.error('Error processing file:', error);
                    showNotification(`Error processing ${validFiles[i].name}`, 'error');
                }
            }
        };

        processFiles();
    }

    // Function to update photo preview
    function updatePhotoPreview() {
        photoPreview.innerHTML = '';
        if (currentPhotos.length === 0) {
            photoPreview.innerHTML = '<div class="no-photos">No files added yet</div>';
            return;
        }
        // Use stacked/fanned style for modal preview only
        const previewStack = document.createElement('div');
        previewStack.className = 'preview-stack';
        const maxStackPhotos = 3;
        currentPhotos.slice(0, maxStackPhotos).forEach((file, idx) => {
            const previewItem = document.createElement('div');
            previewItem.className = 'preview-item';
            
            if (file.type === 'image') {
                previewItem.innerHTML = `
                    <img src="${file.url}" alt="Preview ${idx + 1}">
                    <button class="remove-photo" data-index="${idx}">
                        <i class="fas fa-times"></i>
                    </button>
                `;
            } else if (file.type === 'video') {
                previewItem.innerHTML = `
                    <video src="${file.url}" muted>
                        <source src="${file.url}" type="video/mp4">
                    </video>
                    <div class="video-icon"><i class="fas fa-play"></i></div>
                    <button class="remove-photo" data-index="${idx}">
                        <i class="fas fa-times"></i>
                    </button>
                `;
            }
            
            previewItem.querySelector('.remove-photo').addEventListener('click', () => {
                currentPhotos.splice(idx, 1);
                updatePhotoPreview();
                showNotification('File removed');
            });
            previewStack.appendChild(previewItem);
        });
        if (currentPhotos.length > maxStackPhotos) {
            const badge = document.createElement('div');
            badge.className = 'preview-stack-badge';
            badge.textContent = `+${currentPhotos.length - maxStackPhotos}`;
            previewStack.appendChild(badge);
        }
        photoPreview.appendChild(previewStack);
    }

    // Function to open photo viewer
    function openPhotoViewer(album, index) {
        currentPhotos = album.photos;
        currentPhotoIndex = index;
        const fullPhoto = document.getElementById('fullPhoto');
        const photoTitle = document.getElementById('photoTitle');
        const photoInfoTitle = document.getElementById('photoInfoTitle');
        const photoInfoDescription = document.getElementById('photoInfoDescription');
        const photoViewer = document.getElementById('photoModal');
        const photoLoading = document.querySelector('.photo-loading');
        
        // Reset image state
        fullPhoto.classList.remove('loaded');
        photoLoading.style.display = 'block';
        
        const currentFile = album.photos[index];
        
        // Set initial content
        if (currentFile.type === 'image') {
            fullPhoto.src = currentFile.url;
            fullPhoto.style.display = 'block';
            if (fullPhoto.nextElementSibling) {
                fullPhoto.nextElementSibling.style.display = 'none';
            }
        } else if (currentFile.type === 'video') {
            fullPhoto.style.display = 'none';
            let videoElement = fullPhoto.nextElementSibling;
            if (!videoElement || !videoElement.tagName === 'VIDEO') {
                videoElement = document.createElement('video');
                videoElement.controls = true;
                videoElement.className = 'full-video';
                fullPhoto.parentNode.insertBefore(videoElement, fullPhoto.nextSibling);
            }
            videoElement.src = currentFile.url;
            videoElement.style.display = 'block';
        }
        
        photoTitle.textContent = `${album.name} - ${currentFile.type === 'video' ? 'Video' : 'Photo'} ${index + 1}`;
        photoInfoTitle.textContent = album.name;
        photoInfoDescription.textContent = album.description || `${currentFile.type === 'video' ? 'Video' : 'Photo'} ${index + 1} of ${album.photos.length}`;
        
        // Show modal with animation
        photoViewer.classList.add('active');
        
        // Add loaded class when image is ready
        if (currentFile.type === 'image') {
            fullPhoto.onload = () => {
                fullPhoto.classList.add('loaded');
                photoLoading.style.display = 'none';
            };
        } else if (currentFile.type === 'video') {
            const videoElement = fullPhoto.nextElementSibling;
            videoElement.onloadeddata = () => {
                photoLoading.style.display = 'none';
            };
        }

        // Prevent body scroll
        document.body.style.overflow = 'hidden';
    }

    // Function to close photo viewer
    function closePhotoViewer() {
        const photoViewer = document.getElementById('photoModal');
        photoViewer.classList.remove('active');
        document.body.style.overflow = '';
    }

    // Function to navigate photos
    function navigatePhotos(direction) {
        const fullPhoto = document.getElementById('fullPhoto');
        const photoTitle = document.getElementById('photoTitle');
        const photoInfoTitle = document.getElementById('photoInfoTitle');
        const photoInfoDescription = document.getElementById('photoInfoDescription');
        const photoLoading = document.querySelector('.photo-loading');
        
        // Remove loaded class for transition
        fullPhoto.classList.remove('loaded');
        photoLoading.style.display = 'block';
        
        // Update index
        currentPhotoIndex = (currentPhotoIndex + direction + currentPhotos.length) % currentPhotos.length;
        
        // Update content with animation
        setTimeout(() => {
            const currentFile = currentPhotos[currentPhotoIndex];
            
            if (currentFile.type === 'image') {
                fullPhoto.src = currentFile.url;
                fullPhoto.style.display = 'block';
                if (fullPhoto.nextElementSibling) {
                    fullPhoto.nextElementSibling.style.display = 'none';
                }
            } else if (currentFile.type === 'video') {
                fullPhoto.style.display = 'none';
                let videoElement = fullPhoto.nextElementSibling;
                if (!videoElement || !videoElement.tagName === 'VIDEO') {
                    videoElement = document.createElement('video');
                    videoElement.controls = true;
                    videoElement.className = 'full-video';
                    fullPhoto.parentNode.insertBefore(videoElement, fullPhoto.nextSibling);
                }
                videoElement.src = currentFile.url;
                videoElement.style.display = 'block';
            }
            
            photoTitle.textContent = `${currentFile.type === 'video' ? 'Video' : 'Photo'} ${currentPhotoIndex + 1}`;
            photoInfoDescription.textContent = `${currentFile.type === 'video' ? 'Video' : 'Photo'} ${currentPhotoIndex + 1} of ${currentPhotos.length}`;
            
            // Add loaded class when image is ready
            if (currentFile.type === 'image') {
                fullPhoto.onload = () => {
                    fullPhoto.classList.add('loaded');
                    photoLoading.style.display = 'none';
                };
            } else if (currentFile.type === 'video') {
                const videoElement = fullPhoto.nextElementSibling;
                videoElement.onloadeddata = () => {
                    photoLoading.style.display = 'none';
                };
            }
        }, 300);
    }

    // Event Listeners
    addAlbumBtn.addEventListener('click', () => {
        console.log('Add Album button clicked');
        albumModal.classList.add('active');
        currentPhotos = [];
        updatePhotoPreview();
        albumForm.reset();
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
    });

    document.querySelectorAll('.close-modal').forEach(button => {
        button.addEventListener('click', () => {
            console.log('Close button clicked');
            if (button.closest('#photoModal')) {
                closePhotoViewer();
            } else {
                const modal = button.closest('.modal');
                if (modal) {
                    modal.classList.remove('active');
                    document.body.style.overflow = ''; // Restore background scrolling
                }
            }
        });
    });

    cancelBtn.addEventListener('click', () => {
        console.log('Cancel button clicked');
        if (currentPhotos.length > 0) {
            if (confirm('Are you sure you want to cancel? Any unsaved changes will be lost.')) {
                albumModal.classList.remove('active');
                document.body.style.overflow = '';
                albumForm.reset();
                currentPhotos = [];
                updatePhotoPreview();
                currentAlbum = null;
                document.querySelector('#albumModal .modal-header h2').textContent = 'Create New Album';
                saveBtn.textContent = 'Create Album';
            }
        } else {
            albumModal.classList.remove('active');
            document.body.style.overflow = '';
            albumForm.reset();
            currentPhotos = [];
            updatePhotoPreview();
            currentAlbum = null;
            document.querySelector('#albumModal .modal-header h2').textContent = 'Create New Album';
            saveBtn.textContent = 'Create Album';
        }
    });

    // Handle drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        handlePhotoUpload(e.dataTransfer.files);
    });

    photoInput.addEventListener('change', (e) => {
        handlePhotoUpload(e.target.files);
    });

    // Photo navigation
    document.getElementById('prevPhoto').addEventListener('click', () => navigatePhotos(-1));
    document.getElementById('nextPhoto').addEventListener('click', () => navigatePhotos(1));

    // Handle form submission
    albumForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('Form submitted');
        
        const albumName = document.getElementById('albumName').value.trim();
        const albumYear = document.getElementById('albumYear').value;
        const albumDescription = document.getElementById('albumDescription').value.trim();
        
        if (!validateAlbumData(albumName, albumYear, currentPhotos)) {
            return;
        }
        
        setLoading(true);
        
        try {
            if (currentAlbum) {
                // Update existing album
                currentAlbum.name = albumName;
                currentAlbum.year = albumYear;
                currentAlbum.description = albumDescription;
                currentAlbum.photos = [...currentPhotos];
            } else {
                // Create new album
                const newAlbum = {
                    name: albumName,
                    year: albumYear,
                    description: albumDescription,
                    note: '',
                    photos: [...currentPhotos],
                    createdAt: new Date().toISOString(),
                    owner: getCurrentUser()
                };
                albums.push(newAlbum);
            }
            
            await saveAlbums();
            updateAlbumFilters();
            updateGallery();
            albumModal.classList.remove('active');
            document.body.style.overflow = '';
            albumForm.reset();
            currentPhotos = [];
            updatePhotoPreview();
            showNotification(currentAlbum ? 'Album updated successfully!' : 'Album created successfully!');
        } catch (error) {
            console.error('Error saving album:', error);
            showNotification('Error saving album. Please try again.', 'error');
        } finally {
            setLoading(false);
            currentAlbum = null;
            document.querySelector('#albumModal .modal-header h2').textContent = 'Create New Album';
            saveBtn.textContent = 'Create Album';
        }
    });

    // Handle logout with data preservation
    document.querySelector('.back-btn').addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            // Save any pending changes before logout
            if (currentAlbum) {
                await saveAlbums();
            }
            if (currentNote) {
                await saveNotes();
            }
            // Only remove login state
            localStorage.removeItem('isLoggedIn');
            window.location.href = 'index.html';
        } catch (error) {
            console.error('Error during logout:', error);
            showNotification('Error saving changes. Please try again.', 'error');
        }
    });

    // Add keyboard navigation for photo viewer
    document.addEventListener('keydown', (e) => {
        if (photoModal.classList.contains('active')) {
            if (e.key === 'ArrowLeft') {
                navigatePhotos(-1);
            } else if (e.key === 'ArrowRight') {
                navigatePhotos(1);
            } else if (e.key === 'Escape') {
                closePhotoViewer();
            }
        }
    });

    // Add click outside to close photo viewer
    photoModal.addEventListener('click', (e) => {
        if (e.target === photoModal) {
            closePhotoViewer();
        }
    });

    // Add touch swipe support for photo navigation
    let touchStartX = 0;
    let touchEndX = 0;

    photoModal.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    });

    photoModal.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    });

    function handleSwipe() {
        const swipeThreshold = 50;
        if (touchEndX < touchStartX - swipeThreshold) {
            navigatePhotos(1); // Swipe left
        } else if (touchEndX > touchStartX + swipeThreshold) {
            navigatePhotos(-1); // Swipe right
        }
    }

    // Album Preview Modal logic
    const albumPreviewModal = document.getElementById('albumPreviewModal');
    const albumPreviewTitle = document.getElementById('albumPreviewTitle');
    const albumPreviewYear = document.getElementById('albumPreviewYear');
    const albumPreviewDescription = document.getElementById('albumPreviewDescription');
    const albumPreviewGrid = document.getElementById('albumPreviewGrid');
    let currentAlbum = null;

    // Function to show note in album preview
    function showNote(album) {
        const existingNote = document.querySelector('.note-display');
        if (existingNote) {
            existingNote.remove();
        }

        if (album.note) {
            const noteDisplay = document.createElement('div');
            noteDisplay.className = 'note-display';
            noteDisplay.innerHTML = `
                <div class="note-content">${album.note}</div>
                <div class="note-actions">
                    <button class="note-action-btn edit-note" title="Edit Note">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="note-action-btn delete-note" title="Delete Note">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;

            // Add edit note handler
            noteDisplay.querySelector('.edit-note').addEventListener('click', () => {
                openNoteModal();
            });

            // Add delete note handler
            noteDisplay.querySelector('.delete-note').addEventListener('click', () => {
                if (confirm('Are you sure you want to delete this note?')) {
                    album.note = '';
                    saveAlbums();
                    showNote(album);
                    showNotification('Note deleted');
                }
            });

            albumPreviewModal.querySelector('.modal-content').insertBefore(
                noteDisplay,
                albumPreviewGrid
            );
        }
    }

    // Function to open note modal
    function openNoteModal() {
        currentNote = null;
        document.getElementById('noteTitle').value = '';
        document.getElementById('noteYear').value = '';
        document.getElementById('noteContent').value = '';
        noteModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    // Function to close note modal
    function closeNoteModal() {
        noteModal.classList.remove('active');
        document.body.style.overflow = '';
        currentAlbum = null;
    }

    // Handle note form submission
    noteForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('noteTitle').value.trim();
        const year = document.getElementById('noteYear').value;
        const content = document.getElementById('noteContent').value.trim();
        
        if (!title || !content) {
            showNotification('Please fill in all required fields', 'error');
            return;
        }
        
        const currentUser = getCurrentUser();
        try {
            if (currentNote) {
                // Update existing note
                currentNote.title = title;
                currentNote.year = year;
                currentNote.content = content;
                currentNote.updatedAt = new Date().toISOString();
            } else {
                // Create new note
                const newNote = {
                    id: Date.now().toString(),
                    title,
                    year,
                    content,
                    createdAt: new Date().toISOString(),
                    owner: currentUser
                };
                notes.push(newNote);
            }
            
            await saveNotes();
            updateNotesGrid();
            closeNoteModal();
            showNotification(currentNote ? 'Note updated successfully!' : 'Note created successfully!');
        } catch (error) {
            console.error('Error saving note:', error);
            showNotification('Error saving note. Please try again.', 'error');
        }
    });

    // Add note button click handler
    addNoteBtn.addEventListener('click', () => {
        openNoteModal();
    });

    // Close note modal handlers
    noteModal.querySelector('.close-modal').addEventListener('click', closeNoteModal);
    noteModal.querySelector('.cancel-btn').addEventListener('click', closeNoteModal);
    noteModal.addEventListener('click', (e) => {
        if (e.target === noteModal) {
            closeNoteModal();
        }
    });

    // Function to open album preview modal
    function openAlbumPreviewModal(album) {
        currentAlbum = album;
        albumPreviewTitle.textContent = album.name;
        albumPreviewYear.textContent = '';
        albumPreviewDescription.textContent = '';
        albumPreviewGrid.innerHTML = '';
        
        // Show note if exists
        showNote(album);

        // Only show 'no photos' if album.photos is missing or empty
        if (!Array.isArray(album.photos) || album.photos.length === 0) {
            const noPhotosMsg = document.createElement('div');
            noPhotosMsg.className = 'no-photos';
            noPhotosMsg.textContent = 'No photos in this album.';
            albumPreviewGrid.appendChild(noPhotosMsg);
        } else {
            // Always show all photos in the grid
            album.photos.forEach((photo, idx) => {
                if (photo) { // Only add if photo is not empty/null
                    const img = document.createElement('img');
                    img.src = photo.url;
                    img.alt = `${album.name} photo ${idx + 1}`;
                    img.loading = 'lazy';
                    img.style.animation = 'fadeIn 0.5s ease-out forwards';
                    img.style.animationDelay = `${idx * 0.1}s`;
                    img.addEventListener('click', () => {
                        // Smooth scale/fade animation before opening viewer
                        img.style.transition = 'transform 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.3s cubic-bezier(0.4,0,0.2,1)';
                        img.style.transform = 'scale(1.15)';
                        img.style.opacity = '0';
                        setTimeout(() => {
                            albumPreviewModal.classList.remove('active');
                            albumPreviewModal.style.display = 'none';
                            document.body.style.overflow = '';
                            openPhotoViewer(album, idx);
                        }, 280);
                    });
                    albumPreviewGrid.appendChild(img);
                }
            });
            if (albumPreviewGrid.childElementCount === 0) {
                const noPhotosMsg = document.createElement('div');
                noPhotosMsg.className = 'no-photos';
                noPhotosMsg.textContent = 'No photos in this album.';
                albumPreviewGrid.appendChild(noPhotosMsg);
            }
        }

        // Show the modal with animation
        albumPreviewModal.style.display = 'flex';
        setTimeout(() => {
            albumPreviewModal.classList.add('active');
        }, 10);
        document.body.style.overflow = 'hidden';
    }

    // Add click event to album cards (not just images)
    function addAlbumCardClickHandlers() {
        document.querySelectorAll('.gallery-item').forEach(item => {
            // Remove any previous click handlers
            item.onclick = null;
            item.addEventListener('click', function (e) {
                // Prevent click if delete button is clicked
                if (e.target.closest('.delete-btn')) return;
                // Prevent click if an image is clicked (let image open photo viewer)
                if (e.target.tagName === 'IMG') return;
                const albumName = item.dataset.album;
                const album = albums.find(a => a.name === albumName);
                if (album) openAlbumPreviewModal(album);
            });
            // Also allow clicking the photo grid (but not individual images)
            const grid = item.querySelector('.photo-grid');
            if (grid) {
                grid.onclick = (e) => {
                    if (e.target.tagName === 'IMG') return;
                    const albumName = item.dataset.album;
                    const album = albums.find(a => a.name === albumName);
                    if (album) openAlbumPreviewModal(album);
                };
            }
        });
    }

    // Function to update notes grid
    function updateNotesGrid() {
        notesGrid.innerHTML = '';
        // Show all notes regardless of ownership
        notes.forEach(note => {
            const card = document.createElement('div');
            card.className = 'note-card';
            card.innerHTML = `
                <h3 class="note-title">${note.title}</h3>
                <span class="note-year">${note.year}</span>
                <p class="note-content">${note.content}</p>
                <span class="note-date">${new Date(note.createdAt).toLocaleDateString()}</span>
            `;
            card.addEventListener('click', () => openNoteView(note));
            notesGrid.appendChild(card);
        });
    }

    // Function to open note view
    function openNoteView(note) {
        currentNote = note;
        document.getElementById('noteViewTitle').textContent = note.title;
        document.getElementById('noteViewYear').textContent = note.year;
        document.getElementById('noteViewDate').textContent = new Date(note.createdAt).toLocaleDateString();
        document.getElementById('noteViewText').textContent = note.content;
        noteViewModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    // Function to close note view
    function closeNoteView() {
        noteViewModal.classList.remove('active');
        document.body.style.overflow = '';
        currentNote = null;
    }

    // Handle edit note button
    editNoteBtn.addEventListener('click', () => {
        if (currentNote) {
            closeNoteView();
            openNoteModal();
        }
    });

    // Handle delete note button
    deleteNoteBtn.addEventListener('click', () => {
        if (currentNote && confirm('Are you sure you want to delete this note?')) {
            deleteNote(currentNote.id);
        }
    });

    // Handle tab switching
    document.querySelectorAll('.tab-btn').forEach(button => {
        button.addEventListener('click', () => {
            const tab = button.dataset.tab;
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            document.getElementById('albumsTab').style.display = tab === 'albums' ? 'block' : 'none';
            document.getElementById('notesTab').style.display = tab === 'notes' ? 'block' : 'none';
        });
    });

    // Close modal handlers
    document.querySelectorAll('.close-modal').forEach(button => {
        button.addEventListener('click', () => {
            if (button.closest('#noteViewModal')) {
                closeNoteView();
            } else if (button.closest('#noteModal')) {
                closeNoteModal();
            }
        });
    });

    // Close modals when clicking outside
    noteModal.addEventListener('click', (e) => {
        if (e.target === noteModal) {
            closeNoteModal();
        }
    });

    noteViewModal.addEventListener('click', (e) => {
        if (e.target === noteViewModal) {
            closeNoteView();
        }
    });

    // Function to open edit album modal
    function openEditAlbumModal(album) {
        currentPhotos = [...album.photos];
        document.getElementById('albumName').value = album.name;
        document.getElementById('albumYear').value = album.year;
        document.getElementById('albumDescription').value = album.description || '';
        updatePhotoPreview();
        
        // Change modal title and button text
        document.querySelector('#albumModal .modal-header h2').textContent = 'Edit Album';
        saveBtn.textContent = 'Save Changes';
        
        // Store the album being edited
        currentAlbum = album;
        
        // Show modal
        albumModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    // Function to validate album data
    function validateAlbumData(name, year, photos) {
        if (!name.trim()) {
            showNotification('Please enter an album name', 'error');
            return false;
        }
        if (!year) {
            showNotification('Please select a year', 'error');
            return false;
        }
        if (photos.length === 0) {
            showNotification('Please add at least one photo', 'error');
            return false;
        }
        if (albums.some(album => album.name === name)) {
            showNotification('An album with this name already exists', 'error');
            return false;
        }
        return true;
    }

    // Function to create album button
    function createAlbumButton(album) {
        const button = document.createElement('button');
        button.className = 'filter-btn';
        button.dataset.album = album.name;
        button.innerHTML = `
            ${album.name}
            <span class="photo-count">${album.photos.length}</span>
        `;
        button.addEventListener('click', () => {
            document.querySelectorAll('.album-filters .filter-btn').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            filterGallery();
        });
        return button;
    }

    // Function to create gallery item
    function createGalleryItem(album) {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        item.dataset.year = album.year;
        item.dataset.album = album.name;
        
        const photoGrid = document.createElement('div');
        photoGrid.className = 'photo-grid';
        
        // Add photo count badge
        const photoCountBadge = document.createElement('div');
        photoCountBadge.className = 'photo-count-badge';
        photoCountBadge.innerHTML = `
            <i class="fas fa-camera"></i>
            ${album.photos.length}
        `;
        photoGrid.appendChild(photoCountBadge);

        // Show first file as cover
        if (album.photos.length > 0) {
            const firstFile = album.photos[0];
            if (firstFile.type === 'image') {
                const img = document.createElement('img');
                img.src = firstFile.url;
                img.alt = `${album.name} cover photo`;
                img.loading = 'lazy';
                img.addEventListener('click', () => openPhotoViewer(album, 0));
                photoGrid.appendChild(img);
            } else if (firstFile.type === 'video') {
                const video = document.createElement('video');
                video.src = firstFile.url;
                video.muted = true;
                video.className = 'cover-video';
                video.addEventListener('click', () => openPhotoViewer(album, 0));
                photoGrid.appendChild(video);
            }
        }
        
        item.innerHTML = `
            <div class="gallery-item-content">
                <h3>${album.name}</h3>
                <p class="year">${album.year}</p>
                ${album.description ? `<p class="description">${album.description}</p>` : ''}
                <div class="photo-count">
                    <i class="fas fa-camera"></i>
                    ${album.photos.length} files
                </div>
                <div class="album-actions">
                    <button class="edit-btn" data-album="${album.name}"><i class="fas fa-edit"></i></button>
                    <button class="delete-btn" data-album="${album.name}"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;

        // Add delete button handler
        item.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Are you sure you want to delete the album "${album.name}"?`)) {
                item.style.animation = 'fadeOut 0.3s ease-out';
                setTimeout(() => {
                    deleteAlbum(album.name);
                }, 300);
            }
        });

        // Add edit button handler
        item.querySelector('.edit-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openEditAlbumModal(album);
        });

        item.insertBefore(photoGrid, item.firstChild);
        return item;
    }

    // Function to update album filters
    function updateAlbumFilters() {
        albumFilters.innerHTML = '<button class="filter-btn active" data-album="all">All Albums</button>';
        // Show all albums regardless of ownership
        albums.forEach(album => {
            albumFilters.appendChild(createAlbumButton(album));
        });

        // Add click handler for "All Albums" button
        const allAlbumsBtn = albumFilters.querySelector('[data-album="all"]');
        if (allAlbumsBtn) {
            allAlbumsBtn.addEventListener('click', () => {
                document.querySelectorAll('.album-filters .filter-btn').forEach(btn => btn.classList.remove('active'));
                allAlbumsBtn.classList.add('active');
                filterGallery();
            });
        }
    }

    // Function to update gallery with animation
    function updateGallery() {
        const oldItems = gallery.querySelectorAll('.gallery-item');
        oldItems.forEach(item => {
            item.style.animation = 'fadeOut 0.3s ease-out';
        });

        setTimeout(() => {
            gallery.innerHTML = '';
            // Show all albums regardless of ownership
            albums.forEach(album => {
                gallery.appendChild(createGalleryItem(album));
            });
            addAlbumCardClickHandlers();
        }, 300);
    }

    // Function to filter gallery
    function filterGallery() {
        const activeButton = document.querySelector('.album-filters .filter-btn.active');
        if (!activeButton) return;
        
        const albumFilter = activeButton.dataset.album;
        const galleryItems = document.querySelectorAll('.gallery-item');
        
        galleryItems.forEach(item => {
            if (albumFilter === 'all') {
                item.style.display = 'block';
            } else {
                item.style.display = item.dataset.album === albumFilter ? 'block' : 'none';
            }
        });
    }

    // Add storage event listener for cross-tab synchronization
    window.addEventListener('storage', (e) => {
        if (e.key === 'albums') {
            albums = JSON.parse(e.newValue) || [];
            updateAlbumFilters();
            updateGallery();
        } else if (e.key === 'notes') {
            notes = JSON.parse(e.newValue) || [];
            updateNotesGrid();
        }
    });

    // Initialize data on page load
    loadData();

    // Add periodic save
    setInterval(async () => {
        if (albums.length > 0) {
            await saveAlbums();
        }
        if (notes.length > 0) {
            await saveNotes();
        }
    }, 30000); // Save every 30 seconds

    // Add beforeunload event listener
    window.addEventListener('beforeunload', async () => {
        if (currentAlbum) {
            await saveAlbums();
        }
        if (currentNote) {
            await saveNotes();
        }
    });
});