const API = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:3000' : '';

let USER = null;
let USER_ID = null;
let CURRENT_FILTER = 'all';
let CURRENT_STORY_ID = null;
let STORIES = [];

function checkAuth() {
  const userData = sessionStorage.getItem('lexinco_user');
  if (userData) {
    USER = JSON.parse(userData);
    USER_ID = USER.id;

    // Update profile name
    const profileSpan = document.getElementById('profileName');
    if (profileSpan) profileSpan.textContent = USER.salutation + ' ' + USER.name.split(' ')[0];

    return true;
  }
  return false; // Guests allowed
}

function logout() {
  sessionStorage.removeItem('lexinco_user');
  window.location.href = 'login.html';
}

// === HELPERS ===
function timeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  const intervals = [
    { label: 'year', seconds: 31536000 },
    { label: 'month', seconds: 2592000 },
    { label: 'day', seconds: 86400 },
    { label: 'hour', seconds: 3600 },
    { label: 'minute', seconds: 60 }
  ];
  for (const i of intervals) {
    const count = Math.floor(seconds / i.seconds);
    if (count >= 1) return count === 1 ? `1 ${i.label} ago` : `${count} ${i.label}s ago`;
  }
  return 'just now';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

// Toast notification function
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;

  if (type === 'error') {
    toast.style.background = 'linear-gradient(135deg, var(--red), #dc2626)';
  } else if (type === 'info') {
    toast.style.background = 'linear-gradient(135deg, var(--blue), var(--primary))';
  }

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// === RENDER FEED ===
function renderFeed(stories) {
  STORIES = stories;
  const container = document.getElementById('feedScreen');
  if (!stories.length) {
    container.innerHTML = '<p style="text-align:center; color:var(--text-muted); margin:40px 0;">No stories yet. Be the first to share!</p>';
    return;
  }

  container.innerHTML = stories.map(s => {
    const isLiked = !!s.liked_by_user;
    const likeIcon = isLiked ? 'fa-solid fa-thumbs-up' : 'fa-regular fa-thumbs-up';
    const likeColor = isLiked ? 'var(--amber)' : 'var(--text-muted)';
    const displayName = s.user_name ? `${s.user_salutation || 'Mr.'} ${s.user_name.split(' ')[0]}` : 'Anonymous';

    return `
              <div class="snap-card">
              <div class="card" onclick="showDetail('${s.story_id}')">
                  <div class="user-row">
<div class="user-info" onclick="event.stopPropagation(); showUserProfile('${s.posted_by_user_id || s.user_id || ''}', '${escapeHtml(displayName)}')" style="cursor:pointer;">
    <div class="avatar"><i class="fa-solid fa-user"></i></div>
    <div>
        <div style="font-weight:600;">${displayName}</div>
        <div class="user-meta">Globe ${s.original_lang || 'English'} • ${timeAgo(s.created_at)}</div>
    </div>
</div>
                      ${s.type ? `<div class="type-badge">${s.type}</div>` : ''}
                  </div>

                  <div class="ai-summary"><i class="fa-solid fa-sparkles"></i> AI Summary</div>
                  <p style="margin:12px 0; line-height:1.6;">${escapeHtml(s.ai_summary || '')}</p>

                  <div style="display:flex; gap:16px; flex-wrap:wrap; margin:8px 0;">
                      ${s.amount ? `<div class="amount">${s.amount}</div>` : ''}
                      ${s.evidence_count ? `<div class="evidence"><i class="fa-solid fa-paperclip"></i> ${s.evidence_count} files</div>` : ''}
                  </div>

                  <div class="tags">
                      ${(s.tags || []).map(t => `<span class="tag">#${t}</span>`).join('')}
                  </div>

                  <div class="actions">
                      <div class="status ${s.status === 'ready_escalate' ? 'escalate' : s.status === 'action_plan' ? 'action' : 'seeking'}">
                          ${s.status === 'ready_escalate' ? '<i class="fa-solid fa-shield-halved"></i> Ready to Escalate' :
        s.status === 'action_plan' ? '<i class="fa-solid fa-circle-check"></i> Action Plan' :
          '<i class="fa-solid fa-circle-info"></i> Seeking Guidance'}
                      </div>
                      <div style="display:flex; gap:20px; position:relative;">
                          <div class="action-btn" onclick="event.stopPropagation(); toggleReactionPicker('${s.story_id}', this)" onmouseenter="event.stopPropagation();">
                              <i class="${likeIcon}" style="color:${likeColor}"></i> <span>${s.likes_count || 0}</span>
                              <div class="reaction-picker" id="reaction-${s.story_id}">
                                  <span class="reaction-emoji" onclick="event.stopPropagation(); reactToStory('${s.story_id}', '👍', this)">👍</span>
                                  <span class="reaction-emoji" onclick="event.stopPropagation(); reactToStory('${s.story_id}', '❤️', this)">❤️</span>
                                  <span class="reaction-emoji" onclick="event.stopPropagation(); reactToStory('${s.story_id}', '💪', this)">💪</span>
                                  <span class="reaction-emoji" onclick="event.stopPropagation(); reactToStory('${s.story_id}', '🙏', this)">🙏</span>
                                  <span class="reaction-emoji" onclick="event.stopPropagation(); reactToStory('${s.story_id}', '😢', this)">😢</span>
                              </div>
                          </div>
                          <div class="action-btn" onclick="event.stopPropagation(); showDetail('${s.story_id}')">
                              <i class="fa-solid fa-message"></i> <span>${s.comments_count || 0}</span>
                          </div>
                          <div class="action-btn" onclick="event.stopPropagation(); toggleBookmark('${s.story_id}', this)">
                              <i class="fa-regular fa-bookmark bookmark-icon"></i>
                          </div>
                          <div class="action-btn" onclick="event.stopPropagation(); toggleShareMenu('${s.story_id}', this)" style="position:relative;">
                              <i class="fa-solid fa-share-nodes"></i>
                              <div class="share-menu" id="share-${s.story_id}">
                                  <div class="share-option" onclick="event.stopPropagation(); shareStory('${s.story_id}', 'copy')">
                                      <i class="fa-solid fa-link"></i> Copy Link
                                  </div>
                                  <div class="share-option" onclick="event.stopPropagation(); shareStory('${s.story_id}', 'whatsapp')">
                                      <i class="fa-brands fa-whatsapp"></i> WhatsApp
                                  </div>
                                  <div class="share-option" onclick="event.stopPropagation(); shareStory('${s.story_id}', 'twitter')">
                                      <i class="fa-brands fa-twitter"></i> Twitter
                                  </div>
                                  <div class="share-option" onclick="event.stopPropagation(); shareStory('${s.story_id}', 'email')">
                                      <i class="fa-solid fa-envelope"></i> Email
                                  </div>
                              </div>
                          </div>
                      </div>
                  </div>

                  <!-- Story Stats -->
                  <div class="story-stats">
                      <div class="stat-item" onclick="event.stopPropagation();">
                          <i class="fa-solid fa-eye"></i>
                          <span>${Math.floor(Math.random() * 500) + 50}</span>
                      </div>
                      <div class="stat-item" onclick="event.stopPropagation();">
                          <i class="fa-solid fa-fire"></i>
                          <span>${s.likes_count > 10 ? 'Trending' : 'Hot'}</span>
                      </div>
                      <div class="stat-item" onclick="event.stopPropagation();">
                          <i class="fa-solid fa-clock"></i>
                          <span>${timeAgo(s.created_at)}</span>
                      </div>
                  </div>

                  <button class="generate-btn" onclick="event.stopPropagation(); window.location.href='legal-notice.html?story_id=${s.story_id}'">
                      <i class="fa-solid fa-gavel"></i> Generate Legal Notice
                  </button>
              </div>
              </div>`;
  }).join('');
}

async function loadFeed(filter = CURRENT_FILTER) {
  showLoader("Loading stories...");
  try {
    let url = filter === 'all' ? `${API}/api/stories` : `${API}/api/stories/filter?filter=${filter}`;
    if (!USER_ID) url += (url.includes('?') ? '&' : '?') + 'public=1';

    const headers = USER_ID ? { 'user-id': USER_ID } : {};
    const res = await fetch(url, { headers });
    const data = await res.json();
    if (data.success) {
      const stories = data.stories || [];
      originalStories = stories;
      renderFeed(stories);

      // Initialize parallax after rendering
      setTimeout(() => {
        initParallax();
        initSwipeGestures();
      }, 100);
    }
  } catch (e) {
    console.error(e);
    alert("Failed to load stories");
  } finally {
    hideLoader();
  }
}

function setFilter(filter) {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.remove('active');
    if (tab.textContent.includes(
      filter === 'all' ? 'All' :
        filter === 'trending' ? 'Trending' : 'Recent'
    )) {
      tab.classList.add('active');
    }
  });
  CURRENT_FILTER = filter;
  loadFeed(filter);
}
function showLoader(text = "Loading...") {
  const loader = document.getElementById('globalLoader');
  const span = loader.querySelector('span');
  span.textContent = text;
  loader.style.display = 'flex';
  document.body.style.overflow = 'hidden'; // prevent scroll
}

// Hide loader
function hideLoader() {
  const loader = document.getElementById('globalLoader');
  loader.style.display = 'none';
  document.body.style.overflow = '';
}

// === LIKE ===
async function toggleLike(storyId, btn) {
  if (!USER_ID) return requireLogin();
  if (!USER_ID) { alert('Login required'); window.location.href = 'login.html'; return; }
  try {
    const res = await fetch(`${API}/api/story/${storyId}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: USER_ID })
    });
    const json = await res.json();
    if (json.success) {
      const icon = btn.querySelector('i');
      const count = btn.querySelector('span');
      if (json.liked) {
        icon.className = 'fa-solid fa-thumbs-up';
        icon.style.color = 'var(--amber)';
        count.textContent = (parseInt(count.textContent) + 1);
      } else {
        icon.className = 'fa-regular fa-thumbs-up';
        icon.style.color = '';
        count.textContent = (parseInt(count.textContent) - 1);
      }
    }
  } catch (e) { console.error(e); }
}

// === COMMENTS ===
async function loadComments(storyId) {
  const res = await fetch(`${API}/api/story/${storyId}/comments`);
  const data = await res.json();
  return data.success ? data.comments : [];
}

async function postComment(storyId, content, parentId = null) {
  const res = await fetch(`${API}/api/story/${storyId}/comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: USER_ID, content, parent_id: parentId })
  });
  const json = await res.json();
  return json.success ? json.comment : null;
}

function renderComment(c, depth = 0) {
  const displayName = c.user_name ? `${c.user_salutation || 'Mr.'} ${c.user_name.split(' ')[0]}` : 'Anonymous';
  const userId = c.user_id || ''; // This is critical – comes from your backend comment response
  const hasReplies = c.replies && c.replies.length > 0;
  const indent = Math.min(depth, 3) * 16;
  const border = depth > 0 ? 'border-left: 1px solid var(--border); padding-left: 12px;' : '';

  return `
    <div class="comment ${hasReplies ? 'replies' : ''}" data-depth="${depth}" style="margin-left:${indent}px; ${border}">
      <div class="comment-avatar" 
           onclick="event.stopPropagation(); if('${userId}') showUserProfile('${userId}', '${escapeHtml(displayName)}')"
           style="cursor:${userId ? 'pointer' : 'default'};">
        <i class="fa-solid fa-user"></i>
      </div>
      <div class="comment-body">
        <div class="comment-meta" 
             onclick="event.stopPropagation(); if('${userId}') showUserProfile('${userId}', '${escapeHtml(displayName)}')"
             style="cursor:${userId ? 'pointer' : 'default'};">
          ${displayName} • ${timeAgo(c.created_at)}
        </div>
        <div class="comment-content">${escapeHtml(c.content)}</div>
        <div class="comment-actions">
          <a onclick="showReplyBox('${c.comment_id}', this)">Reply</a>
        </div>
        <div id="reply-box-${c.comment_id}"></div>
      </div>
    </div>
    ${hasReplies ? '<div class="comment-replies">' + c.replies.map(r => renderComment(r, depth + 1)).join('') + '</div>' : ''}
  `;
}

function renderCommentsTree(comments) {
  const map = {};
  const roots = [];

  comments.forEach(c => {
    c.replies = [];
    map[c.comment_id] = c;
    if (c.parent_id && map[c.parent_id]) {
      map[c.parent_id].replies.push(c);
    } else {
      roots.push(c);
    }
  });

  return roots.map(root => renderComment(root)).join('');
}

// === SHOW DETAIL (THIS WAS MISSING!) ===
async function showDetail(story_id) {
  CURRENT_STORY_ID = story_id;
  const story = STORIES.find(s => s.story_id === story_id);
  if (!story) return;

  const comments = await loadComments(story_id);
  const displayName = story.user_name ? `${story.user_salutation || 'Mr.'} ${story.user_name.split(' ')[0]}` : 'Anonymous';

  document.getElementById('detailContent').innerHTML = `
          <div class="card">
<div class="user-info" onclick="event.stopPropagation(); showUserProfile('${story.posted_by_user_id || story.user_id || ''}', '${escapeHtml(displayName)}')" style="cursor:pointer;">
    <div class="avatar"><i class="fa-solid fa-user"></i></div>
    <div>
        <div style="font-weight:600;">${displayName}</div>
        <div class="user-meta"><i class="fa-solid fa-globe"></i> ${story.original_lang || 'English'} • ${timeAgo(story.created_at)}</div>
    </div>
</div>

              <div class="ai-summary"><i class="fa-solid fa-sparkles"></i> AI Summary</div>
              <p style="margin:16px 0; line-height:1.7;">${escapeHtml(story.ai_summary)}</p>

              <p style="color:var(--text-muted); margin:20px 0 8px;">Original Story</p>
              <div style="background:var(--bg); padding:16px; border-radius:12px; white-space:pre-wrap; font-size:0.95rem;">
                  ${escapeHtml(story.original_text)}
              </div>

<div class="detail-actions">
    <button class="generate-btn" onclick="window.location.href='legal-notice.html?story_id=${story_id}'">
        <i class="fa-solid fa-file-lines"></i> Generate Legal Notice
    </button>
    <button class="consult-btn" onclick="window.location.href='consultation.html?story_id=${story_id}'">
        <i class="fa-solid fa-phone"></i> Consult Advocate
    </button>
</div>

<div class="comments-section">
  <div class="comments-header">
    <i class="fa-solid fa-message"></i> Comments (${comments.length})
  </div>

  <textarea id="commentInput" placeholder="Write a supportive comment..." style="height:90px; margin-bottom:8px;"></textarea>
  <button class="submit-btn" style="padding:10px;" onclick="submitComment('${story_id}')">Post Comment</button>

  <div id="commentPostingLoader" class="comment-loader" style="display:none;">
    <i class="fa-solid fa-spinner"></i> Posting your comment...
  </div>

  <div id="commentsContainer" style="margin-top:20px;">
    ${renderCommentsTree(comments)}
  </div>

  <div id="replyComposer" class="reply-composer" style="display:none;">
    <div class="reply-composer-header">
      <span class="reply-pill" id="replyTarget">Replying</span>
      <button onclick="closeReplyComposer()" style="background:none;border:none;color:var(--text-muted);font-size:0.95rem;">Cancel</button>
    </div>
    <textarea id="replyComposerInput" placeholder="Add a public reply..."></textarea>
    <div class="actions">
      <button class="submit-btn" style="padding:10px 18px;width:auto;min-width:120px;" onclick="submitReply()">Reply</button>
    </div>
  </div>
</div>
`;

  document.getElementById('feedScreen').style.display = 'none';
  document.getElementById('detailScreen').style.display = 'block';
}

function showFeed() {
  document.getElementById('detailScreen').style.display = 'none';
  document.getElementById('feedScreen').style.display = 'block';
}

let ACTIVE_REPLY_ID = null;
let LAST_REPLY_BUTTON = null;

function showReplyBox(parentId, el) {
  const composer = document.getElementById('replyComposer');
  const target = document.getElementById('replyTarget');
  const input = document.getElementById('replyComposerInput');

  // Restore previous button if switching targets
  if (LAST_REPLY_BUTTON && LAST_REPLY_BUTTON !== el) {
    LAST_REPLY_BUTTON.style.visibility = '';
  }

  // Toggle off if same target
  if (composer.style.display === 'block' && ACTIVE_REPLY_ID === parentId) {
    closeReplyComposer();
    return;
  }

  ACTIVE_REPLY_ID = parentId;
  LAST_REPLY_BUTTON = el;
  if (LAST_REPLY_BUTTON) LAST_REPLY_BUTTON.style.visibility = 'hidden';

  target.textContent = 'Replying to comment';
  composer.style.display = 'block';
  input.value = '';
  input.focus();

  // Scroll the composer into view on mobile
  composer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeReplyComposer() {
  const composer = document.getElementById('replyComposer');
  const input = document.getElementById('replyComposerInput');
  composer.style.display = 'none';
  input.value = '';
  if (LAST_REPLY_BUTTON) {
    LAST_REPLY_BUTTON.style.visibility = '';
  }
  ACTIVE_REPLY_ID = null;
  LAST_REPLY_BUTTON = null;
}

async function submitComment(storyId) {
  if (!USER_ID) return requireLogin();
  const input = document.getElementById('commentInput');
  const content = input.value.trim();
  if (!content) return;

  document.getElementById('commentPostingLoader').style.display = 'inline-flex';
  input.disabled = true;

  const comment = await postComment(storyId, content);

  document.getElementById('commentPostingLoader').style.display = 'none';
  input.disabled = false;

  if (comment) {
    input.value = '';
    showDetail(storyId); // refreshes with new comment
  }
}

async function submitReply() {
  if (!USER_ID) return requireLogin();
  if (!ACTIVE_REPLY_ID) return;
  const input = document.getElementById('replyComposerInput');
  const content = input.value.trim();
  if (!content) return;

  input.disabled = true;
  const loader = document.createElement('div');
  loader.className = 'comment-loader';
  loader.innerHTML = '<i class="fa-solid fa-spinner"></i> Posting reply...';
  input.parentNode.appendChild(loader);

  const comment = await postComment(CURRENT_STORY_ID, content, ACTIVE_REPLY_ID);

  loader.remove();
  input.disabled = false;

  if (comment) {
    closeReplyComposer();
    showDetail(CURRENT_STORY_ID);
  }
}

// === MODAL & POST ===
function openShareModal() {
  if (!USER_ID) return requireLogin();
  document.getElementById('shareModal').classList.add('active');
}
function updateBottomNav(activeItem) {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });
  if (activeItem === 'feed') {
    document.querySelector('.bottom-nav .nav-item:nth-child(1)').classList.add('active');
  } else if (activeItem === 'profile') {
    document.querySelector('.bottom-nav .nav-item:nth-child(3)').classList.add('active');
  }
}
function closeShareModal() { document.getElementById('shareModal').classList.remove('active'); }

document.querySelector('#shareModal .submit-btn').addEventListener('click', async () => {
  if (!USER_ID) return alert('Login required');

  const text = document.getElementById('postText').value.trim();
  if (!text) return alert('Please write your story');

  const isAnonymous = document.getElementById('anonymousCheckbox').checked;

  showLoader("Posting your story...");

  try {
    const res = await fetch(`${API}/api/story`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: USER_ID,
        original_lang: 'english',
        original_text: text,
        is_anonymous: isAnonymous
      })
    });

    const json = await res.json();
    if (json.success) {
      closeShareModal();
      document.getElementById('postText').value = '';
      document.getElementById('anonymousCheckbox').checked = false;
      alert('Story posted successfully!');
      loadFeed();
    } else {
      alert('Failed to post story: ' + (json.message || 'Try again'));
    }
  } catch (err) {
    console.error(err);
    alert('Network error. Please try again.');
  } finally {
    hideLoader();
  }
});

// === PROFILE ===
async function showProfile() {
  if (!USER_ID) {
    location.href = 'signup.html';
    return;
  }

  showLoader("Loading your profile...");

  try {
    const res = await fetch(`${API}/api/user/${USER_ID}/stories`);
    const data = await res.json();
    const stories = data.stories || [];

    document.getElementById('detailContent').innerHTML = `
      <!-- Profile Header -->
      <div class="profile-header">
        <div class="profile-avatar">
          <i class="fa-solid fa-user"></i>
        </div>
        <h2 class="profile-name">${USER.salutation} ${USER.name}</h2>
        <p class="profile-username">@${USER.name.toLowerCase().replace(/\s+/g, '')}</p>
        
        <div class="profile-stats">
          <div class="stat-box">
            <span class="stat-number">${stories.length}</span>
            <span class="stat-label">Stories</span>
          </div>
          <div class="stat-box">
            <span class="stat-number">${stories.reduce((sum, s) => sum + (s.likes_count || 0), 0)}</span>
            <span class="stat-label">Reactions</span>
          </div>
          <div class="stat-box">
            <span class="stat-number">${stories.reduce((sum, s) => sum + (s.comments_count || 0), 0)}</span>
            <span class="stat-label">Comments</span>
          </div>
        </div>

        <button onclick="logout()" 
                style="margin-top:20px; background:linear-gradient(135deg, var(--red), #dc2626); color:white; padding:10px 28px; border:none; border-radius:12px; font-weight:600; cursor:pointer; transition:all 0.3s ease;">
          <i class="fa-solid fa-right-from-bracket"></i> Logout
        </button>
      </div>

      <!-- Profile Stories -->
      <div class="profile-stories">
        <h3 class="section-title">
          <i class="fa-solid fa-book-open"></i>
          Your Stories
        </h3>

        ${stories.length === 0 ? `
          <div class="empty-state">
            <i class="fa-solid fa-pen-to-square"></i>
            <h3>No Stories Yet</h3>
            <p>Share your first story with the community</p>
            <button onclick="openShareModal()">
              <i class="fa-solid fa-plus"></i> Share Your Story
            </button>
          </div>
        ` : stories.map(s => {
      const category = s.type || 'General';
      const categoryEmoji =
        category.includes('Legal') ? '⚖️' :
          category.includes('Financial') ? '💰' :
            category.includes('Family') ? '👨‍👩‍👧' :
              category.includes('Workplace') ? '💼' :
                category.includes('Consumer') ? '🛒' :
                  category.includes('Property') ? '🏠' : '📝';

      return `
            <div class="story-card-compact" onclick="showDetail('${s.story_id}')">
              <div class="story-card-header">
                <div class="story-title">${escapeHtml((s.ai_summary || 'Untitled Story').substring(0, 80))}${(s.ai_summary || '').length > 80 ? '...' : ''}</div>
                <div class="story-category-badge">${categoryEmoji} ${category}</div>
              </div>
              
              <div class="story-excerpt">
                ${escapeHtml((s.original_text || '').substring(0, 120))}${(s.original_text || '').length > 120 ? '...' : ''}
              </div>
              
              <div class="story-meta-row">
                <div class="story-date">
                  <i class="fa-solid fa-clock"></i>
                  ${timeAgo(s.created_at)}
                </div>
                <div class="story-stats-mini">
                  <div class="story-stat-mini">
                    <i class="fa-solid fa-thumbs-up"></i>
                    <span>${s.likes_count || 0}</span>
                  </div>
                  <div class="story-stat-mini">
                    <i class="fa-solid fa-message"></i>
                    <span>${s.comments_count || 0}</span>
                  </div>
                </div>
              </div>
            </div>
          `;
    }).join('')}
      </div>`;

    document.getElementById('feedScreen').style.display = 'none';
    document.getElementById('detailScreen').style.display = 'block';
    updateBottomNav('profile');
    hideLoader();
  } catch (e) {
    console.error(e);
    hideLoader();
    showToast('Failed to load profile', 'error');
  }
}

// === INIT ===
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  loadFeed();

  // Make functions global so onclick works
  window.setFilter = setFilter;
  window.showFeed = showFeed;
  window.showDetail = showDetail;
  window.toggleLike = toggleLike;
  window.showReplyBox = showReplyBox;
  window.submitComment = submitComment;
  window.submitReply = submitReply;
  window.showProfile = showProfile;
  window.toggleReactionPicker = toggleReactionPicker;
  window.reactToStory = reactToStory;
  window.toggleBookmark = toggleBookmark;
  window.toggleShareMenu = toggleShareMenu;
  window.shareStory = shareStory;
  window.filterByCategory = filterByCategory;

  // Add ripple effect to buttons
  document.addEventListener('click', function (e) {
    if (e.target.matches('.generate-btn, .submit-btn, .fab')) {
      const ripple = document.createElement('span');
      const rect = e.target.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;

      ripple.style.cssText = `
            position: absolute;
            width: ${size}px;
            height: ${size}px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.5);
            left: ${x}px;
            top: ${y}px;
            pointer-events: none;
            animation: ripple 0.6s ease-out;
          `;

      e.target.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    }
  });

  // Add CSS for ripple animation
  const style = document.createElement('style');
  style.textContent = `
        @keyframes ripple {
          from {
            transform: scale(0);
            opacity: 1;
          }
          to {
            transform: scale(4);
            opacity: 0;
          }
        }
      `;
  document.head.appendChild(style);
});
function requireLogin() {
  sessionStorage.setItem('redirect_after_login', location.href);
  location.href = 'signup.html';
}

// Reminder after scrolling
let scrolled = 0;
window.addEventListener('scroll', () => {
  if (USER_ID) return;
  scrolled++;
  if (scrolled > 6 && !document.getElementById('guestHint')) {
    const hint = document.createElement('div');
    hint.id = 'guestHint';
    hint.innerHTML = `You are not alone — <a href="signup.html" style="color:var(--amber);font-weight:600;">Join community</a> to support others`;
    hint.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:var(--card);border:1px solid var(--amber);padding:12px 20px;border-radius:50px;z-index:100;font-size:0.9rem;';
    document.body.appendChild(hint);
    setTimeout(() => hint.remove(), 7000);
  }
});
let originalStories = []; // Will store all stories for filtering

function toggleSearch() {
  const input = document.getElementById('searchInput');
  const icon = document.getElementById('searchIcon');

  if (input.style.display === 'none' || !input.style.display) {
    input.style.display = 'block';
    input.style.width = '200px';
    input.focus();
    icon.style.opacity = '0.6';
  }
}

function hideSearchIfEmpty() {
  const input = document.getElementById('searchInput');
  const icon = document.getElementById('searchIcon');
  setTimeout(() => {
    if (!input.value.trim()) {
      input.style.width = '0';
      input.style.padding = '0 12px';
      setTimeout(() => { input.style.display = 'none'; }, 300);
      icon.style.opacity = '1';
    }
  }, 200);
}

function performSearch() {
  const query = document.getElementById('searchInput').value.trim().toLowerCase();
  if (!query) {
    renderFeed(originalStories);
    return;
  }

  const filtered = originalStories.filter(story => {
    const summary = (story.ai_summary || '').toLowerCase();
    const original = (story.original_text || '').toLowerCase();
    const tags = (story.tags || []).join(' ').toLowerCase();
    return summary.includes(query) || original.includes(query) || tags.includes(query);
  });

  renderFeed(filtered);
}
async function showUserProfile(targetUserId, displayName) {
  if (!targetUserId) {
    showToast("Cannot view profile (anonymous post)", "info");
    return;
  }

  showLoader("Loading profile...");

  try {
    const res = await fetch(`${API}/api/user/${targetUserId}/public-stories`);
    const data = await res.json();

    if (!data.success) {
      hideLoader();
      showToast("Profile not found or private", "error");
      return;
    }

    const stories = data.stories || [];

    document.getElementById('detailContent').innerHTML = `
      <!-- Profile Header -->
      <div class="profile-header">
        <div class="profile-avatar">
          <i class="fa-solid fa-user"></i>
        </div>
        <h2 class="profile-name">${escapeHtml(displayName)}</h2>
        <p class="profile-username">Community Member</p>
        
        <div class="profile-stats">
          <div class="stat-box">
            <span class="stat-number">${stories.length}</span>
            <span class="stat-label">Stories</span>
          </div>
          <div class="stat-box">
            <span class="stat-number">${stories.reduce((sum, s) => sum + (s.likes_count || 0), 0)}</span>
            <span class="stat-label">Reactions</span>
          </div>
          <div class="stat-box">
            <span class="stat-number">${stories.reduce((sum, s) => sum + (s.comments_count || 0), 0)}</span>
            <span class="stat-label">Comments</span>
          </div>
        </div>
      </div>

      <!-- Profile Stories -->
      <div class="profile-stories">
        <h3 class="section-title">
          <i class="fa-solid fa-book-open"></i>
          Public Stories
        </h3>

        ${stories.length === 0 ? `
          <div class="empty-state">
            <i class="fa-solid fa-inbox"></i>
            <h3>No Public Stories</h3>
            <p>This user hasn't shared any public stories yet.</p>
          </div>
        ` : stories.map(s => {
      const category = s.type || 'General';
      const categoryEmoji =
        category.includes('Legal') ? '⚖️' :
          category.includes('Financial') ? '💰' :
            category.includes('Family') ? '👨‍👩‍👧' :
              category.includes('Workplace') ? '💼' :
                category.includes('Consumer') ? '🛒' :
                  category.includes('Property') ? '🏠' : '📝';

      return `
            <div class="story-card-compact" onclick="showDetail('${s.story_id}')">
              <div class="story-card-header">
                <div class="story-title">${escapeHtml((s.ai_summary || 'Untitled Story').substring(0, 80))}${(s.ai_summary || '').length > 80 ? '...' : ''}</div>
                <div class="story-category-badge">${categoryEmoji} ${category}</div>
              </div>
              
              <div class="story-excerpt">
                ${escapeHtml((s.original_text || s.ai_summary || '').substring(0, 120))}${((s.original_text || s.ai_summary || '').length > 120) ? '...' : ''}
              </div>
              
              <div class="story-meta-row">
                <div class="story-date">
                  <i class="fa-solid fa-clock"></i>
                  ${timeAgo(s.created_at)}
                </div>
                <div class="story-stats-mini">
                  <div class="story-stat-mini">
                    <i class="fa-solid fa-thumbs-up"></i>
                    <span>${s.likes_count || 0}</span>
                  </div>
                  <div class="story-stat-mini">
                    <i class="fa-solid fa-message"></i>
                    <span>${s.comments_count || 0}</span>
                  </div>
                </div>
              </div>
            </div>
          `;
    }).join('')}
      </div>`;

    document.getElementById('feedScreen').style.display = 'none';
    document.getElementById('detailScreen').style.display = 'block';
    document.querySelector('.back-btn').onclick = showFeed;

    hideLoader();
  } catch (e) {
    console.error(e);
    hideLoader();
    showToast("Failed to load profile", "error");
  }
}

// === NEW FEATURES ===

// Story Progress Indicator
function updateProgressIndicator() {
  const container = document.getElementById('storyProgress');
  const cards = document.querySelectorAll('.snap-card');

  container.innerHTML = '';
  cards.forEach((card, index) => {
    const dot = document.createElement('div');
    dot.className = 'progress-dot';
    dot.setAttribute('data-index', index);
    dot.onclick = () => scrollToStory(index);
    container.appendChild(dot);
  });

  updateActiveProgressDot();
}

function updateActiveProgressDot() {
  const feedContainer = document.getElementById('feedScreen');
  const cards = document.querySelectorAll('.snap-card');
  const dots = document.querySelectorAll('.progress-dot');
  const cardStep = window.innerHeight * 0.9;

  const activeIndex = Math.min(
    cards.length - 1,
    Math.round(feedContainer.scrollTop / cardStep)
  );

  dots.forEach((dot, index) => {
    dot.classList.toggle('active', index === activeIndex);
  });

  // Show swipe indicator on first story
  if (activeIndex === 0 && cards.length > 1) {
    const indicator = document.getElementById('swipeIndicator');
    indicator.classList.add('show');
    setTimeout(() => indicator.classList.remove('show'), 3000);
  }
}

function scrollToStory(index) {
  const feedContainer = document.getElementById('feedScreen');
  const cardStep = window.innerHeight * 0.9;
  feedContainer.scrollTo({
    top: index * cardStep,
    behavior: 'smooth'
  });
}

// Reaction System
function toggleReactionPicker(storyId, btn) {
  const picker = document.getElementById(`reaction-${storyId}`);
  const allPickers = document.querySelectorAll('.reaction-picker');

  allPickers.forEach(p => {
    if (p !== picker) p.classList.remove('active');
  });

  picker.classList.toggle('active');
}

async function reactToStory(storyId, emoji, btn) {
  if (!USER_ID) return requireLogin();

  // Close picker
  const picker = document.getElementById(`reaction-${storyId}`);
  picker.classList.remove('active');

  // Animate emoji
  const emojiEl = document.createElement('div');
  emojiEl.textContent = emoji;
  emojiEl.style.cssText = `
        position: fixed;
        font-size: 3rem;
        pointer-events: none;
        z-index: 1000;
        animation: floatUp 1s ease-out forwards;
      `;

  const rect = btn.getBoundingClientRect();
  emojiEl.style.left = rect.left + 'px';
  emojiEl.style.top = rect.top + 'px';
  document.body.appendChild(emojiEl);

  // Add animation CSS
  if (!document.getElementById('floatUpAnimation')) {
    const style = document.createElement('style');
    style.id = 'floatUpAnimation';
    style.textContent = `
          @keyframes floatUp {
            to {
              transform: translateY(-100px) scale(1.5);
              opacity: 0;
            }
          }
        `;
    document.head.appendChild(style);
  }

  setTimeout(() => emojiEl.remove(), 1000);

  // Send to server (reuse like endpoint for now)
  try {
    const res = await fetch(`${API}/api/story/${storyId}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: USER_ID })
    });
    const json = await res.json();

    // Mirror toggleLike UI update so state persists on screen
    const likeBtn = picker?.parentElement; // action-btn wrapping the picker
    const icon = likeBtn?.querySelector('i');
    const countEl = likeBtn?.querySelector('span');

    if (json?.success && icon && countEl) {
      if (json.liked) {
        icon.className = 'fa-solid fa-thumbs-up';
        icon.style.color = 'var(--amber)';
        countEl.textContent = (parseInt(countEl.textContent) + 1);
      } else {
        icon.className = 'fa-regular fa-thumbs-up';
        icon.style.color = '';
        countEl.textContent = Math.max(0, parseInt(countEl.textContent) - 1);
      }
    }

    showToast(`Reacted with ${emoji}`, json?.success ? 'success' : 'error');
  } catch (e) {
    console.error(e);
    showToast('Could not save reaction', 'error');
  }
}

// Bookmark System
let bookmarkedStories = JSON.parse(localStorage.getItem('bookmarked_stories') || '[]');

function toggleBookmark(storyId, btn) {
  const icon = btn.querySelector('.bookmark-icon');
  const isBookmarked = bookmarkedStories.includes(storyId);

  if (isBookmarked) {
    bookmarkedStories = bookmarkedStories.filter(id => id !== storyId);
    icon.classList.remove('fa-solid', 'bookmarked');
    icon.classList.add('fa-regular');
    showToast('Removed from bookmarks', 'info');
  } else {
    bookmarkedStories.push(storyId);
    icon.classList.remove('fa-regular');
    icon.classList.add('fa-solid', 'bookmarked');
    showToast('Added to bookmarks', 'success');
  }

  localStorage.setItem('bookmarked_stories', JSON.stringify(bookmarkedStories));
}

// Share System
function toggleShareMenu(storyId, btn) {
  const menu = document.getElementById(`share-${storyId}`);
  const allMenus = document.querySelectorAll('.share-menu');

  allMenus.forEach(m => {
    if (m !== menu) m.classList.remove('active');
  });

  menu.classList.toggle('active');
}

function shareStory(storyId, platform) {
  const url = `${window.location.origin}${window.location.pathname}?story=${storyId}`;
  const text = 'Check out this story on Lexinco';

  switch (platform) {
    case 'copy':
      navigator.clipboard.writeText(url);
      showToast('Link copied to clipboard!', 'success');
      break;
    case 'whatsapp':
      window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`, '_blank');
      break;
    case 'twitter':
      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
      break;
    case 'email':
      window.location.href = `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(url)}`;
      break;
  }

  // Close menu
  document.querySelectorAll('.share-menu').forEach(m => m.classList.remove('active'));
}

// Category Filter
let currentCategory = 'all';

function filterByCategory(category) {
  currentCategory = category;

  // Update UI
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.category === category);
  });

  // Filter stories (simple client-side for now)
  if (category === 'all') {
    renderFeed(originalStories);
  } else {
    const filtered = originalStories.filter(story => {
      // You can enhance this with actual category tags from backend
      const text = (story.ai_summary + story.original_text).toLowerCase();
      switch (category) {
        case 'legal': return text.includes('legal') || text.includes('court') || text.includes('law');
        case 'financial': return text.includes('money') || text.includes('payment') || text.includes('loan');
        case 'family': return text.includes('family') || text.includes('divorce') || text.includes('marriage');
        case 'workplace': return text.includes('work') || text.includes('job') || text.includes('employer');
        case 'consumer': return text.includes('product') || text.includes('service') || text.includes('refund');
        case 'property': return text.includes('property') || text.includes('house') || text.includes('land');
        default: return true;
      }
    });
    renderFeed(filtered);
  }

  setTimeout(() => {
    updateProgressIndicator();
    initSwipeGestures();
  }, 100);
}

// Swipe Gestures
function initSwipeGestures() {
  const feedContainer = document.getElementById('feedScreen');
  let startY = 0;
  let startTime = 0;

  feedContainer.addEventListener('touchstart', (e) => {
    startY = e.touches[0].clientY;
    startTime = Date.now();
  });

  feedContainer.addEventListener('touchend', (e) => {
    const endY = e.changedTouches[0].clientY;
    const endTime = Date.now();
    const diff = startY - endY;
    const timeDiff = endTime - startTime;

    // Quick swipe detection
    if (Math.abs(diff) > 50 && timeDiff < 300) {
      const cardStep = window.innerHeight * 0.9;
      const currentScroll = feedContainer.scrollTop;
      const currentIndex = Math.round(currentScroll / cardStep);
      const cards = document.querySelectorAll('.snap-card');

      if (diff > 0 && currentIndex < cards.length - 1) {
        // Swipe up - next card
        feedContainer.scrollTo({
          top: (currentIndex + 1) * cardStep,
          behavior: 'smooth'
        });
      } else if (diff < 0 && currentIndex > 0) {
        // Swipe down - previous card
        feedContainer.scrollTo({
          top: (currentIndex - 1) * cardStep,
          behavior: 'smooth'
        });
      }
    }
  });
}

// Close menus when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.action-btn')) {
    document.querySelectorAll('.reaction-picker, .share-menu').forEach(el => {
      el.classList.remove('active');
    });
  }
});

// === END NEW FEATURES ===

// Initialize card stacking scroll (boundless-style)
function initParallax() {
  const feedContainer = document.getElementById('feedScreen');
  if (!feedContainer) return;

  feedContainer.addEventListener('scroll', () => {
    const cards = document.querySelectorAll('.snap-card');

    cards.forEach((snapCard, index) => {
      const card = snapCard.querySelector('.card');
      if (!card) return;

      const rect = snapCard.getBoundingClientRect();
      const viewportHeight = window.innerHeight;

      // Set z-index so cards stack in order
      snapCard.style.zIndex = cards.length - index;

      // Card is at top (already scrolled past)
      if (rect.top <= 0) {
        const scrollDepth = Math.abs(rect.top);
        const scaleAmount = Math.max(0.92, 1 - scrollDepth / (viewportHeight * 3));
        card.style.transform = `scale(${scaleAmount})`;
        card.style.width = '100%';
        card.style.maxWidth = '100%';
        card.style.borderRadius = '0';
      }
      // Card is coming into view (scrolling up)
      else if (rect.top > 0 && rect.top < viewportHeight * 0.8) {
        const progress = rect.top / (viewportHeight * 0.8);
        card.style.transform = 'scale(1)';
        card.style.width = '80%';
        card.style.maxWidth = '800px';
        card.style.borderRadius = '24px';
      }
      // Card is below viewport
      else {
        card.style.transform = 'scale(1)';
        card.style.width = '80%';
        card.style.maxWidth = '800px';
        card.style.borderRadius = '24px';
      }
    });

    // Header scroll effect
    const header = document.querySelector('header');
    if (feedContainer.scrollTop > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  });
}

// Observe snap-cards for intersection
const observerOptions = {
  threshold: 0.3,
  rootMargin: '0px'
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    const card = entry.target.querySelector('.card');
    if (entry.isIntersecting && card) {
      card.style.animation = 'cardFadeIn 0.6s ease-out forwards';
    }
  });
}, observerOptions);

// Observe all snap-cards after rendering
function observeCards() {
  document.querySelectorAll('.snap-card').forEach(snapCard => {
    observer.observe(snapCard);
  });
}
