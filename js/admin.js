import { db, auth } from './app.js';
import { 
    collection, 
    getDocs, 
    doc, 
    updateDoc, 
    deleteDoc,
    query,
    orderBy,
    onSnapshot 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { 
    signInWithEmailAndPassword, 
    signOut,
    onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// Cloudinary Configuration (same as register.js)
const CLOUDINARY_CLOUD_NAME = 'df17jssg2';
const CLOUDINARY_UPLOAD_PRESET = 'sple_uploads';

let allRegistrations = [];
let currentEditId = null;

// Check auth state
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('loginSection').classList.add('hidden');
        document.getElementById('dashboardSection').classList.remove('hidden');
        loadRegistrations();
    } else {
        document.getElementById('loginSection').classList.remove('hidden');
        document.getElementById('dashboardSection').classList.add('hidden');
    }
});

// Login
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('adminEmail').value;
    const password = document.getElementById('adminPassword').value;
    
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        alert('Login failed: ' + error.message);
    }
});

// Logout
document.getElementById('logoutBtn').addEventListener('click', async () => {
    await signOut(auth);
});

// Load registrations
async function loadRegistrations() {
    try {
        const q = query(collection(db, 'registrations'), orderBy('createdAt', 'desc'));
        
        onSnapshot(q, (snapshot) => {
            allRegistrations = [];
            snapshot.forEach((doc) => {
                allRegistrations.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            
            updateStats();
            displayRegistrations(allRegistrations);
        });
    } catch (error) {
        console.error('Error loading registrations:', error);
    }
}

// Update statistics
function updateStats() {
    const total = allRegistrations.length;
    const members = allRegistrations.filter(r => r.type === 'Member').length;
    const associates = allRegistrations.filter(r => r.type === 'Associate Member').length;
    const pending = allRegistrations.filter(r => !r.type || r.type === '').length;
    
    document.getElementById('totalCount').textContent = total;
    document.getElementById('memberCount').textContent = members;
    document.getElementById('associateCount').textContent = associates;
    document.getElementById('pendingCount').textContent = pending;
}

// Display registrations in table
function displayRegistrations(data) {
    const tbody = document.getElementById('registrationsTable');
    tbody.innerHTML = '';
    
    if (data.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="px-4 py-8 text-center text-gray-500">
                    <i class="fas fa-inbox text-4xl mb-2"></i>
                    <p>No registrations found</p>
                </td>
            </tr>
        `;
        return;
    }
    
    data.forEach(reg => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50';
        
        const fullName = `${reg.firstname} ${reg.midname} ${reg.surname}`;
        const dateStr = reg.createdAt ? new Date(reg.createdAt.seconds * 1000).toLocaleDateString() : 'N/A';
        
        const typeClass = reg.type === 'Member' ? 'bg-green-100 text-green-800' : 
                         reg.type === 'Associate Member' ? 'bg-yellow-100 text-yellow-800' : 
                         'bg-gray-100 text-gray-800';
        
        tr.innerHTML = `
            <td class="px-4 py-3 text-sm text-gray-800">${fullName}</td>
            <td class="px-4 py-3 text-sm text-gray-600">${reg.email}</td>
            <td class="px-4 py-3 text-sm text-gray-600">${reg.contact}</td>
            <td class="px-4 py-3 text-sm">
                <span class="px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                    ${reg.category}
                </span>
            </td>
            <td class="px-4 py-3 text-sm">
                <span class="px-2 py-1 rounded-full text-xs ${typeClass}">
                    ${reg.type || 'Pending'}
                </span>
            </td>
            <td class="px-4 py-3 text-sm text-gray-600">${dateStr}</td>
            <td class="px-4 py-3 text-sm">
                <div class="flex gap-2">
                    <button onclick="viewRegistration('${reg.id}')" 
                        class="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition text-xs">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button onclick="editRegistration('${reg.id}')" 
                        class="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600 transition text-xs">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="deleteRegistration('${reg.id}')" 
                        class="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition text-xs">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        
        tbody.appendChild(tr);
    });
}

// Upload file to Cloudinary (same function as register.js)
async function uploadToCloudinary(file, folder = 'sple-attachments') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('folder', folder);
    
    const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`,
        {
            method: 'POST',
            body: formData
        }
    );
    
    if (!response.ok) {
        throw new Error(`Cloudinary upload failed: ${response.statusText}`);
    }
    
    const data = await response.json();
    return {
        url: data.secure_url,
        publicId: data.public_id,
        format: data.format,
        size: data.bytes,
        name: file.name,
        type: file.type
    };
}

// View registration
window.viewRegistration = function(id) {
    const reg = allRegistrations.find(r => r.id === id);
    if (!reg) return;
    
    let attachmentsHtml = '';
    if (reg.attachments && reg.attachments.length > 0) {
        attachmentsHtml = reg.attachments.map((att, index) => {
            const sizeKB = att.size ? (att.size / 1024).toFixed(2) : 'N/A';
            const sizeMB = att.size ? (att.size / 1024 / 1024).toFixed(2) : 'N/A';
            const displaySize = att.size > 1024 * 1024 ? `${sizeMB} MB` : `${sizeKB} KB`;
            
            return `<div class="mb-2 flex items-center gap-2">
                <a href="${att.url}" download="${att.name}" target="_blank"
                   class="text-blue-600 hover:underline flex items-center gap-2">
                    <i class="fas fa-download"></i> ${att.name} (${displaySize})
                </a>
                <button onclick="window.open('${att.url}', '_blank')" 
                        class="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm">
                    <i class="fas fa-eye"></i> View
                </button>
            </div>`;
        }).join('');
    }
    
    // FIXED: Standardized signature format (Cloudinary)
    const signatureUrl = reg.signature?.url || '';
    const signatureName = `signature_${reg.surname}.png`;
    
    const detailsHtml = `
        <div class="space-y-4">
            <h3 class="text-2xl font-bold text-gray-800 mb-4">Registration Details</h3>
            
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <p class="text-sm text-gray-500">Full Name</p>
                    <p class="font-semibold">${reg.firstname} ${reg.midname} ${reg.surname}</p>
                </div>
                <div>
                    <p class="text-sm text-gray-500">Email</p>
                    <p class="font-semibold">${reg.email}</p>
                </div>
                <div>
                    <p class="text-sm text-gray-500">Contact Number</p>
                    <p class="font-semibold">${reg.contact}</p>
                </div>
                <div>
                    <p class="text-sm text-gray-500">WhatsApp Number</p>
                    <p class="font-semibold">${reg.whatsapp}</p>
                </div>
                <div>
                    <p class="text-sm text-gray-500">University</p>
                    <p class="font-semibold">${reg.university}</p>
                </div>
                <div>
                    <p class="text-sm text-gray-500">Degree</p>
                    <p class="font-semibold">${reg.degree}</p>
                </div>
                <div>
                    <p class="text-sm text-gray-500">Category</p>
                    <p class="font-semibold">${reg.category}</p>
                </div>
                <div>
                    <p class="text-sm text-gray-500">Type</p>
                    <p class="font-semibold">${reg.type || 'Pending'}</p>
                </div>
            </div>
            
            ${reg.remarks ? `
                <div>
                    <p class="text-sm text-gray-500">Remarks</p>
                    <p class="font-semibold">${reg.remarks}</p>
                </div>
            ` : ''}
            
            <div>
                <p class="text-sm text-gray-500 mb-2">Attachments</p>
                ${attachmentsHtml || '<p class="text-gray-400">No attachments</p>'}
            </div>
            
            <div>
                <p class="text-sm text-gray-500 mb-2">Signature</p>
                ${signatureUrl ? 
                    `<div class="flex gap-2 items-center">
                        <img src="${signatureUrl}" class="border rounded-lg max-w-md">
                        <a href="${signatureUrl}" download="${signatureName}" 
                           class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
                            <i class="fas fa-download"></i> Download
                        </a>
                    </div>` : 
                    '<p class="text-gray-400">No signature</p>'
                }
            </div>
        </div>
    `;
    
    alert(detailsHtml);
};

// Edit registration
window.editRegistration = function(id) {
    const reg = allRegistrations.find(r => r.id === id);
    if (!reg) return;
    
    currentEditId = id;
    
    // Populate form
    document.getElementById('editId').value = id;
    document.getElementById('editSurname').value = reg.surname;
    document.getElementById('editFirstname').value = reg.firstname;
    document.getElementById('editMidname').value = reg.midname;
    document.getElementById('editContact').value = reg.contact;
    document.getElementById('editWhatsapp').value = reg.whatsapp;
    document.getElementById('editEmail').value = reg.email;
    document.getElementById('editUniversity').value = reg.university;
    document.getElementById('editDegree').value = reg.degree;
    document.getElementById('editCategory').value = reg.category;
    document.getElementById('editType').value = reg.type || '';
    document.getElementById('editRemarks').value = reg.remarks || '';
    
    // Display current attachments
    const attachmentsDiv = document.getElementById('currentAttachments');
    attachmentsDiv.innerHTML = '';
    
    if (reg.attachments && reg.attachments.length > 0) {
        reg.attachments.forEach((att, index) => {
            const div = document.createElement('div');
            div.className = 'flex items-center justify-between bg-gray-100 p-3 rounded-lg';
            div.innerHTML = `
                <a href="${att.url}" target="_blank" class="text-blue-600 hover:underline">
                    <i class="fas fa-file"></i> ${att.name}
                </a>
                <button type="button" onclick="deleteAttachment('${id}', ${index})" 
                    class="text-red-500 hover:text-red-700">
                    <i class="fas fa-trash"></i>
                </button>
            `;
            attachmentsDiv.appendChild(div);
        });
    }
    
    // Display signature - FIXED: Standardized format
    const signatureUrl = reg.signature?.url || '';
    if (signatureUrl) {
        document.getElementById('currentSignature').src = signatureUrl;
    }
    
    // Show modal
    document.getElementById('editModal').classList.add('active');
};

// Delete attachment
window.deleteAttachment = async function(regId, attachmentIndex) {
    if (!confirm('Delete this attachment?')) return;
    
    try {
        const reg = allRegistrations.find(r => r.id === regId);
        
        // Update document (just remove from array, Cloudinary keeps the file)
        reg.attachments.splice(attachmentIndex, 1);
        await updateDoc(doc(db, 'registrations', regId), {
            attachments: reg.attachments
        });
        
        // Refresh edit modal
        editRegistration(regId);
        
    } catch (error) {
        console.error('Error deleting attachment:', error);
        alert('Error deleting attachment');
    }
};

// Close edit modal
document.getElementById('closeEditModal').addEventListener('click', () => {
    document.getElementById('editModal').classList.remove('active');
});

document.getElementById('cancelEdit').addEventListener('click', () => {
    document.getElementById('editModal').classList.remove('active');
});

// Submit edit form
document.getElementById('editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('editId').value;
    
    try {
        const updateData = {
            surname: document.getElementById('editSurname').value,
            firstname: document.getElementById('editFirstname').value,
            midname: document.getElementById('editMidname').value,
            contact: document.getElementById('editContact').value,
            whatsapp: document.getElementById('editWhatsapp').value,
            email: document.getElementById('editEmail').value,
            university: document.getElementById('editUniversity').value,
            degree: document.getElementById('editDegree').value,
            category: document.getElementById('editCategory').value,
            type: document.getElementById('editType').value,
            remarks: document.getElementById('editRemarks').value
        };
        
        // FIXED: Upload new attachments to Cloudinary (not base64)
        const newFiles = document.getElementById('editAttachments').files;
        if (newFiles.length > 0) {
            const reg = allRegistrations.find(r => r.id === id);
            const currentAttachments = reg.attachments || [];
            
            console.log(`📎 Uploading ${newFiles.length} new attachment(s)...`);
            
            for (let i = 0; i < newFiles.length; i++) {
                const file = newFiles[i];
                console.log(`  ⏳ Uploading ${file.name}...`);
                
                // Upload to Cloudinary
                const uploadedFile = await uploadToCloudinary(file, 'sple-attachments');
                
                currentAttachments.push({
                    name: uploadedFile.name,
                    type: uploadedFile.type,
                    size: uploadedFile.size,
                    url: uploadedFile.url,
                    publicId: uploadedFile.publicId,
                    format: uploadedFile.format
                });
                
                console.log(`  ✅ ${file.name} uploaded!`);
            }
            
            updateData.attachments = currentAttachments;
        }
        
        await updateDoc(doc(db, 'registrations', id), updateData);
        
        document.getElementById('editModal').classList.remove('active');
        alert('✅ Registration updated successfully!');
        
    } catch (error) {
        console.error('Error updating registration:', error);
        alert('❌ Error updating registration: ' + error.message);
    }
});

// Delete registration
window.deleteRegistration = async function(id) {
    if (!confirm('Are you sure you want to delete this registration?')) return;
    
    try {
        // Delete document (Cloudinary files remain accessible via URL)
        await deleteDoc(doc(db, 'registrations', id));
        
        alert('✅ Registration deleted successfully!');
        
    } catch (error) {
        console.error('Error deleting registration:', error);
        alert('❌ Error deleting registration: ' + error.message);
    }
};

// Export to Excel
document.getElementById('exportExcel').addEventListener('click', () => {
    if (allRegistrations.length === 0) {
        alert('No data to export');
        return;
    }
    
    const data = allRegistrations.map(reg => ({
        'Surname': reg.surname,
        'First Name': reg.firstname,
        'Middle Name': reg.midname,
        'Email': reg.email,
        'Contact': reg.contact,
        'WhatsApp': reg.whatsapp,
        'University': reg.university,
        'Degree': reg.degree,
        'Category': reg.category,
        'Type': reg.type || 'Pending',
        'Remarks': reg.remarks || '',
        'Date': reg.createdAt ? new Date(reg.createdAt.seconds * 1000).toLocaleDateString() : ''
    }));
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    
    // Set column widths
    ws['!cols'] = [
        { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 25 },
        { wch: 15 }, { wch: 15 }, { wch: 30 }, { wch: 30 },
        { wch: 20 }, { wch: 20 }, { wch: 30 }, { wch: 12 }
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, 'Registrations');
    XLSX.writeFile(wb, `SPLE_Kuwait_Registrations_${new Date().toISOString().split('T')[0]}.xlsx`);
});

// Refresh data
document.getElementById('refreshData').addEventListener('click', () => {
    loadRegistrations();
});

// Search functionality
document.getElementById('searchInput').addEventListener('input', filterRegistrations);
document.getElementById('categoryFilter').addEventListener('change', filterRegistrations);
document.getElementById('typeFilter').addEventListener('change', filterRegistrations);

function filterRegistrations() {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const categoryFilter = document.getElementById('categoryFilter').value;
    const typeFilter = document.getElementById('typeFilter').value;
    
    let filtered = allRegistrations.filter(reg => {
        const fullName = `${reg.firstname} ${reg.midname} ${reg.surname}`.toLowerCase();
        const email = reg.email.toLowerCase();
        
        const matchesSearch = fullName.includes(search) || email.includes(search);
        const matchesCategory = !categoryFilter || reg.category === categoryFilter;
        // FIXED: Removed duplicate condition
        const matchesType = typeFilter === '' ? true : reg.type === typeFilter;
        
        return matchesSearch && matchesCategory && matchesType;
    });
    
    displayRegistrations(filtered);
}