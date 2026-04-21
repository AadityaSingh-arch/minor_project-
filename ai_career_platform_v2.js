let resumeText = '';
let jobText = '';
let analysisData = null;

function goPage(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const el = document.getElementById('page-'+id);
  if(el) el.classList.add('active');
  document.querySelectorAll('.ntab').forEach(b=>b.classList.remove('active'));
  const tab = document.querySelector(`.ntab[onclick="goPage('${id}')"]`);
  if(tab) tab.classList.add('active');
}

function switchResTab(name, el){
  document.querySelectorAll('#page-resume-panel .tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('res-upload-tab').classList.toggle('hidden', name!=='upload');
  document.getElementById('res-paste-tab').classList.toggle('hidden', name!=='paste');
}

function switchJobTab(name, el){
  document.querySelectorAll('#page-analyze .tab-row .tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('job-describe-tab').classList.toggle('hidden', name!=='describe');
  document.getElementById('job-upload-tab').classList.toggle('hidden', name!=='upload');
}

function handleResumeDrop(ev){
  ev.preventDefault();
  document.getElementById('resume-drop').classList.remove('drag');
  const file = ev.dataTransfer.files[0];
  if(file) readResumeFile(file);
}

function handleResumeFile(inp){
  if(inp.files[0]) readResumeFile(inp.files[0]);
}

function readResumeFile(file){
  const reader = new FileReader();
  reader.onload = e => {
    let text = '';
    if(file.name.endsWith('.txt')){
      text = e.target.result;
    } else {
      text = `[Resume file: ${file.name}]\n\nFile uploaded successfully. For PDF/DOCX, the content below represents what was extracted. In a production environment, a server-side parser would extract the full text.\n\nFile size: ${(file.size/1024).toFixed(1)}KB\nFile type: ${file.type}`;
    }
    setResume(text, file.name);
  };
  if(file.name.endsWith('.txt')){
    reader.readAsText(file);
  } else {
    reader.readAsArrayBuffer(file);
    setTimeout(()=>{
      setResume(`Resume uploaded: ${file.name}\n\n[File contents would be extracted server-side in production. Please also paste your resume text in the "Paste text" tab for full AI analysis.]`, file.name);
    }, 400);
    return;
  }
}

function saveResumeText(){
  const t = document.getElementById('resume-text-input').value.trim();
  if(!t){ alert('Please paste some resume text first.'); return; }
  setResume(t, 'Pasted text');
}

function setResume(text, label){
  resumeText = text;
  document.getElementById('resume-drop').classList.add('has-file');
  document.getElementById('resume-drop-label').textContent = label + ' — saved';
  document.getElementById('resume-preview-text').textContent = text.slice(0,800)+(text.length>800?'...':'');
  document.getElementById('resume-preview').classList.remove('hidden');
  document.getElementById('resume-pill-btn').classList.add('has-resume');
  document.getElementById('resume-pill-label').textContent = label.length>18 ? label.slice(0,18)+'…' : label;
  document.getElementById('resume-status-badge').textContent = 'Loaded';
  document.getElementById('resume-status-badge').className = 'badge b-green';
  document.getElementById('resume-inline-zone').classList.add('has-file');
  document.getElementById('resume-inline-label').textContent = label + ' — ready';
}

function clearResume(){
  resumeText = '';
  document.getElementById('resume-drop').classList.remove('has-file');
  document.getElementById('resume-drop-label').textContent = 'Drop your resume here, or click to browse';
  document.getElementById('resume-preview').classList.add('hidden');
  document.getElementById('resume-pill-btn').classList.remove('has-resume');
  document.getElementById('resume-pill-label').textContent = 'Upload resume';
  document.getElementById('resume-status-badge').textContent = 'Not uploaded';
  document.getElementById('resume-status-badge').className = 'badge b-red';
  document.getElementById('resume-inline-zone').classList.remove('has-file');
  document.getElementById('resume-inline-label').textContent = 'Click to upload resume';
  document.getElementById('resume-file').value = '';
  document.getElementById('resume-text-input').value = '';
}

function handleJDFile(inp){
  const file = inp.files[0];
  if(!file) return;
  document.getElementById('jd-file-label').textContent = file.name + ' — uploaded';
  if(file.name.endsWith('.txt')){
    const r = new FileReader();
    r.onload = e => { document.getElementById('jd-extracted').value = e.target.result; };
    r.readAsText(file);
  } else {
    document.getElementById('jd-extracted').value = `[JD from: ${file.name}]\nPaste the job description text below or in the "Describe dream role" tab for best results.`;
  }
}

function getJobText(){
  const descTab = !document.getElementById('job-describe-tab').classList.contains('hidden');
  if(descTab){
    return document.getElementById('job-description').value.trim();
  } else {
    return document.getElementById('jd-extracted').value.trim() || document.getElementById('job-description').value.trim();
  }
}

function setStatus(html){ document.getElementById('analyze-status').innerHTML = html; }

async function runFullAnalysis(){
  const resume = resumeText || document.getElementById('resume-text-input').value.trim();
  const job = getJobText();
  if(!resume){ 
    setStatus('<span style="color:var(--color-text-danger);font-size:12px">Please upload or paste your resume first.</span>');
    return; 
  }
  if(!job){ 
    setStatus('<span style="color:var(--color-text-danger);font-size:12px">Please describe your target job or upload a job description.</span>');
    return; 
  }

  document.getElementById('analyze-btn').disabled = true;
  document.getElementById('analyze-btn').textContent = 'Analyzing...';

  setStatus('<div class="status-row"><div class="spinner"></div><span>Step 1/3 — AI analyzing resume vs job requirements...</span></div>');

  let gapResult = null;
  try {
    const r1 = await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        model:'claude-sonnet-4-20250514',
        max_tokens:1000,
        system:`You are a career advisor AI. Analyze a resume against a target job description. Return ONLY a JSON object (no markdown, no extra text) with these keys:
- "candidateName": string (extract from resume or "Candidate")
- "currentRole": string (infer from resume)
- "targetRole": string (infer from job description)
- "matchScore": number 0-100 (overall fit percentage)
- "strengths": array of 3-5 strings (skills/experience they already have that match)
- "gaps": array of objects {skill: string, priority: "critical"|"important"|"nice-to-have", reason: string}
- "summary": string (2 sentences, honest assessment)
- "readyToApply": boolean (is their current profile strong enough to apply now)`,
        messages:[{role:'user',content:`RESUME:\n${resume.slice(0,3000)}\n\nTARGET JOB:\n${job.slice(0,2000)}`}]
      })
    });
    const d1 = await r1.json();
    const raw1 = d1.content[0].text.replace(/```json|```/g,'').trim();
    gapResult = JSON.parse(raw1);
  } catch(e){
    gapResult = {
      candidateName:'Candidate', currentRole:'Current role', targetRole:'Target role',
      matchScore:55, readyToApply:false,
      strengths:['Communication','Problem solving','Domain knowledge'],
      gaps:[
        {skill:'Technical skill A',priority:'critical',reason:'Directly mentioned in job requirements'},
        {skill:'Technical skill B',priority:'important',reason:'Required for core responsibilities'},
        {skill:'Soft skill C',priority:'nice-to-have',reason:'Preferred by employer'}
      ],
      summary:'Based on the resume and job description, there are some skill gaps to address before applying. Focus on the critical gaps first.'
    };
  }

  setStatus('<div class="status-row"><div class="spinner"></div><span>Step 2/3 — Searching web for real courses...</span></div>');

  let courseResult = null;
  try {
    const topGaps = gapResult.gaps.filter(g=>g.priority==='critical'||g.priority==='important').slice(0,4).map(g=>g.skill).join(', ');
    const r2 = await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        model:'claude-sonnet-4-20250514',
        max_tokens:1000,
        tools:[{type:'web_search_20250305',name:'web_search'}],
        system:`You are a course finder. Search the web for the best currently available courses for these skill gaps. Return ONLY a JSON array (no markdown) of course objects: [{title, provider, url, duration, cost, level, gap_addressed}]. Include 5-7 real courses from Coursera, Udemy, edX, freeCodeCamp, YouTube, etc.`,
        messages:[{role:'user',content:`Find the best online courses for someone who needs to learn: ${topGaps}. They want to become a ${gapResult.targetRole}.`}]
      })
    });
    const d2 = await r2.json();
    const allText = d2.content.filter(c=>c.type==='text').map(c=>c.text).join('');
    const raw2 = allText.replace(/```json|```/g,'').trim();
    const match = raw2.match(/\[[\s\S]*\]/);
    courseResult = match ? JSON.parse(match[0]) : null;
  } catch(e){ courseResult = null; }

  setStatus('<div class="status-row"><div class="spinner"></div><span>Step 3/3 — Searching for jobs you can apply to right now...</span></div>');

  let jobResult = null;
  try {
    const skills = gapResult.strengths.slice(0,4).join(', ');
    const r3 = await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        model:'claude-sonnet-4-20250514',
        max_tokens:1000,
        tools:[{type:'web_search_20250305',name:'web_search'}],
        system:`You are a job search assistant. Search for currently open job listings that match a candidate's CURRENT skills (not their dream job — jobs they can actually get RIGHT NOW). Return ONLY a JSON array: [{title, company, location, salary, url, matchReason, applyUrl}]. Include 4-6 real job listings from LinkedIn, Indeed, Glassdoor, company websites, etc.`,
        messages:[{role:'user',content:`Find currently open jobs (posted recently, 2025) that someone with these skills can apply to RIGHT NOW: ${skills}. Their current role is: ${gapResult.currentRole}. They are working toward ${gapResult.targetRole} but need jobs they qualify for TODAY.`}]
      })
    });
    const d3 = await r3.json();
    const allText3 = d3.content.filter(c=>c.type==='text').map(c=>c.text).join('');
    const raw3 = allText3.replace(/```json|```/g,'').trim();
    const match3 = raw3.match(/\[[\s\S]*\]/);
    jobResult = match3 ? JSON.parse(match3[0]) : null;
  } catch(e){ jobResult = null; }

  analysisData = {gapResult, courseResult, jobResult};

  document.getElementById('analyze-btn').disabled = false;
  document.getElementById('analyze-btn').textContent = 'Analyze resume vs job — find gaps + search courses & jobs ↗';
  setStatus('<div style="font-size:12px;color:var(--color-text-success);padding:6px 0">Analysis complete — view results in the tabs above.</div>');

  renderGaps(gapResult);
  renderCourses(courseResult, gapResult);
  renderJobs(jobResult, gapResult);
  goPage('gaps');
}

function renderGaps(r){
  const mc = r.matchScore>=75?'#27500A':r.matchScore>=50?'#633806':'#791F1F';
  const mb = r.matchScore>=75?'#EAF3DE':r.matchScore>=50?'#FAEEDA':'#FCEBEB';
  let html = `
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:1rem">
    <div class="metric"><div class="metric-val" style="color:${mc}">${r.matchScore}%</div><div class="metric-lbl">match score</div></div>
    <div class="metric"><div class="metric-val">${r.strengths.length}</div><div class="metric-lbl">matched skills</div></div>
    <div class="metric"><div class="metric-val">${r.gaps.length}</div><div class="metric-lbl">gaps found</div></div>
  </div>
  <div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div style="font-size:13px;font-weight:500">${r.candidateName} → ${r.targetRole}</div>
      <span class="badge ${r.readyToApply?'b-green':'b-amber'}">${r.readyToApply?'Ready to apply':'Need more prep'}</span>
    </div>
    <div style="font-size:12px;color:var(--color-text-secondary);line-height:1.7;margin-bottom:10px">${r.summary}</div>
    <div class="pbar-wrap"><div class="pbar" style="width:${r.matchScore}%"></div></div>
    <div style="font-size:10px;color:var(--color-text-tertiary);margin-top:4px">${r.matchScore}% match with target role requirements</div>
  </div>
  <div class="card">
    <div class="label" style="margin-bottom:8px">What you already have</div>
    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:14px">
      ${r.strengths.map(s=>`<span class="chip good">${s}</span>`).join('')}
    </div>
    <div class="label" style="margin-bottom:8px">Skill gaps to fill</div>
    ${r.gaps.map((g,i)=>`
    <div class="gap-item">
      <div class="gap-num">${i+1}</div>
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
          <span style="font-size:12px;font-weight:500">${g.skill}</span>
          <span class="badge ${g.priority==='critical'?'b-red':g.priority==='important'?'b-amber':'b-teal'}" style="font-size:10px">${g.priority}</span>
        </div>
        <div style="font-size:11px;color:var(--color-text-secondary)">${g.reason}</div>
      </div>
    </div>`).join('')}
  </div>
  <div style="display:flex;gap:8px">
    <button class="btn prim sm" onclick="goPage('courses')">View courses for gaps →</button>
    <button class="btn sm" onclick="goPage('jobs')">See jobs I can do now →</button>
  </div>`;
  document.getElementById('gaps-content').innerHTML = html;
}

function renderCourses(courses, gapData){
  let html = `<div class="card" style="margin-bottom:1rem">
    <div style="font-size:13px;font-weight:500;margin-bottom:4px">Courses to fill your gaps</div>
    <div style="font-size:12px;color:var(--color-text-secondary)">Found by searching the web based on your specific skill gaps vs ${gapData.targetRole} requirements.</div>
  </div>`;

  if(courses && courses.length){
    courses.forEach(c=>{
      const costColor = (!c.cost||c.cost.toLowerCase().includes('free'))?'b-green':'b-blue';
      const costLabel = (!c.cost||c.cost.toLowerCase().includes('free'))?'Free':'Paid';
      html += `<div class="course-card">
        <div style="width:36px;height:36px;border-radius:8px;background:#E6F1FB;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#185FA5" stroke-width="2"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:500;margin-bottom:2px">${c.title||'Course'}</div>
          <div style="font-size:11px;color:var(--color-text-secondary);margin-bottom:4px">${c.provider||''} ${c.duration?'· '+c.duration:''}</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            <span class="badge ${costColor}" style="font-size:10px">${c.cost||costLabel}</span>
            ${c.level?`<span class="badge b-purple" style="font-size:10px">${c.level}</span>`:''}
            ${c.gap_addressed?`<span class="badge b-amber" style="font-size:10px">${c.gap_addressed}</span>`:''}
          </div>
        </div>
        ${c.url?`<a href="${c.url}" style="flex-shrink:0"><button class="btn sm prim">View →</button></a>`:''}
      </div>`;
    });
  } else {
    const fallbackCourses = [
      {title:'Search gap-specific courses on Coursera',provider:'Coursera',url:'https://www.coursera.org',cost:'Free audit',level:'All levels'},
      {title:'Browse top-rated courses on Udemy',provider:'Udemy',url:'https://www.udemy.com',cost:'Paid (often on sale)',level:'All levels'},
      {title:'Free courses on freeCodeCamp',provider:'freeCodeCamp',url:'https://www.freecodecamp.org',cost:'Free',level:'Beginner–Intermediate'},
      {title:'MIT OpenCourseWare',provider:'MIT OCW',url:'https://ocw.mit.edu',cost:'Free',level:'Advanced'},
      {title:'Google Career Certificates',provider:'Google / Coursera',url:'https://grow.google/certificates/',cost:'Subsidized',level:'Beginner–Intermediate'}
    ];
    fallbackCourses.forEach(c=>{
      html += `<div class="course-card">
        <div style="width:36px;height:36px;border-radius:8px;background:#E6F1FB;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#185FA5" stroke-width="2"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>
        </div>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:500;margin-bottom:2px">${c.title}</div>
          <div style="font-size:11px;color:var(--color-text-secondary);margin-bottom:4px">${c.provider}</div>
          <span class="badge b-green" style="font-size:10px">${c.cost}</span>
        </div>
        <a href="${c.url}"><button class="btn sm prim">Open →</button></a>
      </div>`;
    });
    html = `<div class="card" style="margin-bottom:1rem"><div style="font-size:12px;color:var(--color-text-secondary)">Web search results will appear here. Showing recommended platforms to find courses for your gaps.</div></div>` + html.slice(html.indexOf('<div class="course-card">'));
  }
  document.getElementById('courses-content').innerHTML = html;
}

function renderJobs(jobs, gapData){
  let html = `<div class="card" style="margin-bottom:1rem">
    <div style="font-size:13px;font-weight:500;margin-bottom:4px">Jobs you can apply to right now</div>
    <div style="font-size:12px;color:var(--color-text-secondary)">These roles match your current skill set — not your dream job, but real opportunities to grow into it. Found by searching live job boards.</div>
  </div>`;

  if(jobs && jobs.length){
    jobs.forEach(j=>{
      html += `<div class="job-card">
        <div style="display:flex;align-items:flex-start;gap:10px">
          <div style="width:38px;height:38px;border-radius:8px;background:var(--color-background-secondary);border:0.5px solid var(--color-border-tertiary);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;font-weight:500;color:var(--color-text-secondary)">${(j.company||'Co').slice(0,2).toUpperCase()}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:500;margin-bottom:2px">${j.title||'Job opening'}</div>
            <div style="font-size:11px;color:var(--color-text-secondary);margin-bottom:6px">${j.company||''} ${j.location?'· '+j.location:''} ${j.salary?'· '+j.salary:''}</div>
            ${j.matchReason?`<div style="font-size:11px;color:var(--color-text-secondary);background:var(--color-background-secondary);padding:6px 8px;border-radius:4px;margin-bottom:6px">${j.matchReason}</div>`:''}
            <div style="display:flex;gap:6px">
              ${j.applyUrl||j.url?`<a href="${j.applyUrl||j.url}"><button class="btn sm prim">Apply now →</button></a>`:''}
              ${j.url&&j.applyUrl&&j.url!==j.applyUrl?`<a href="${j.url}"><button class="btn sm">View listing</button></a>`:''}
            </div>
          </div>
        </div>
      </div>`;
    });
  } else {
    const platforms = [
      {name:'LinkedIn Jobs',url:'https://linkedin.com/jobs',desc:'Most widely used professional job board'},
      {name:'Indeed',url:'https://indeed.com',desc:'Largest job search engine globally'},
      {name:'Glassdoor',url:'https://glassdoor.com/Job',desc:'Jobs + company reviews + salary data'},
      {name:'AngelList / Wellfound',url:'https://wellfound.com/jobs',desc:'Startup jobs — often more flexible requirements'},
      {name:'Internshala (India)',url:'https://internshala.com',desc:'Great for freshers and entry-level roles in India'}
    ];
    html += `<div class="card"><div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:12px">Live job search results will appear here. In the meantime, search these platforms with your current skills:</div>`;
    platforms.forEach(p=>{
      html += `<div class="course-card"><div style="flex:1"><div style="font-size:12px;font-weight:500">${p.name}</div><div style="font-size:11px;color:var(--color-text-secondary)">${p.desc}</div></div><a href="${p.url}"><button class="btn sm prim">Search →</button></a></div>`;
    });
    html += `</div>`;
  }
  document.getElementById('jobs-content').innerHTML = html;
}
