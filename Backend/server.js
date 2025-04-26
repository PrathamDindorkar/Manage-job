// server.js
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

config();

const otpStore = new Map();
const app = express();
const PORT = process.env.PORT || 8000;

const SUPABASE_URL = process.env.SUPABASE_URL || "https://hzqvvhgwbalilttjintz.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6cXZ2aGd3YmFsaWx0dGppbnR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgxMzM5MTMsImV4cCI6MjA1MzcwOTkxM30.SUKUsTT62jWUeQmIEUPtpELJHr3F8X_iqgt5Nk98fD0";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Email transporter setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'no1747878@gmail.com',
    pass: process.env.EMAIL_PASSWORD 
  },
});

// Function to generate email content based on status
const getEmailContent = (status, jobTitle, company, candidateName) => {
  const subject = `Update on Your Application for ${jobTitle} at ${company}`;
  let message;

  switch (status) {
    case 'applied':
      message = `Dear ${candidateName},\n\nYour application for the ${jobTitle} position at ${company} has been received. We will review it soon.\n\nBest regards,\nRecruitment Team`;
      break;
    case 'under_review':
      message = `Dear ${candidateName},\n\nYour application for the ${jobTitle} position at ${company} is currently under review. We'll get back to you soon.\n\nBest regards,\nRecruitment Team`;
      break;
    case 'interview':
      message = `Dear ${candidateName},\n\nCongratulations! You've been selected for an interview for the ${jobTitle} position at ${company}. Please reply to this email to schedule a time.\n\nBest regards,\nRecruitment Team`;
      break;
    case 'accepted':
      message = `Dear ${candidateName},\n\nWe are thrilled to inform you that you have been accepted for the ${jobTitle} position at ${company}! Please reply to this email for next steps.\n\nBest regards,\nRecruitment Team`;
      break;
    case 'rejected':
      message = `Dear ${candidateName},\n\nThank you for applying for the ${jobTitle} position at ${company}. Unfortunately, we have decided to move forward with other candidates at this time. We wish you the best in your job search.\n\nBest regards,\nRecruitment Team`;
      break;
    default:
      message = `Dear ${candidateName},\n\nYour application status for the ${jobTitle} position at ${company} has been updated to "${status}". Please contact us if you have any questions.\n\nBest regards,\nRecruitment Team`;
  }

  return { subject, text: message };
};

const corsOptions = {
  origin: ['http://managejob.com', 'https://managejob.com', 'http://localhost:8000'],
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));

app.use(express.json());

// Middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error) throw error;
    req.user = data.user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid authentication token' });
  }
};

app.get("/", (req, res) => {
  res.send("Server is running!");
});

// Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) throw error;

    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("role, id")
      .eq("email", email)
      .single();

    if (userError) throw userError;

    res.json({ 
      message: "Login successful!", 
      user: { ...data.user, id: userData.id }, 
      role: userData.role,
      token: data.session.access_token 
    });
  } catch (err) {
    res.status(401).json({ error: err.message || "Login failed." });
  }
});

// Generate and send OTP
app.post("/api/send-otp", async (req, res) => {
  const { email, fullName } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required." });
  }

  try {
    // Check if email already exists in users table
    const { data: existingUser, error: userError } = await supabase
      .from("users")
      .select("email")
      .eq("email", email)
      .single();

    if (existingUser) {
      return res.status(409).json({ error: "Email already registered." });
    }

    // Generate a random 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP with 10-minute expiration
    otpStore.set(email, {
      otp,
      expiresAt: Date.now() + (10 * 60 * 1000) // 10 minutes
    });

    // Create email for OTP verification
    const mailOptions = {
      from: process.env.EMAIL_USER || 'no1747878@gmail.com',
      to: email,
      subject: "Your OTP for ManageJob Registration",
      text: `Hi ${fullName},\n\nYour verification code for ManageJob registration is: ${otp}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this, please ignore this email.\n\nBest regards,\nManageJob Team`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #4a86e8;">ManageJob Email Verification</h2>
          <p>Hi ${fullName},</p>
          <p>Thank you for registering with ManageJob! To complete your registration, please use the verification code below:</p>
          <div style="background-color: #f5f5f5; padding: 10px; border-radius: 5px; text-align: center; font-size: 24px; letter-spacing: 5px; margin: 20px 0;">
            <strong>${otp}</strong>
          </div>
          <p>This code will expire in 10 minutes.</p>
          <p>If you didn't request this, please ignore this email.</p>
          <p>Best regards,<br>ManageJob Team</p>
        </div>
      `
    };

    // Send email
    await transporter.sendMail(mailOptions);

    res.json({ success: true, message: "OTP sent successfully" });
  } catch (err) {
    console.error("Error sending OTP:", err);
    res.status(500).json({ error: "Failed to send OTP" });
  }
});

// Verify OTP
app.post("/api/verify-otp", (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: "Email and OTP are required." });
  }

  const storedData = otpStore.get(email);

  if (!storedData) {
    return res.status(400).json({ error: "No OTP request found. Please request a new OTP." });
  }

  if (Date.now() > storedData.expiresAt) {
    otpStore.delete(email); // Clean up expired OTP
    return res.status(400).json({ error: "OTP has expired. Please request a new OTP." });
  }

  if (storedData.otp !== otp) {
    return res.status(400).json({ error: "Invalid OTP." });
  }

  // OTP verified successfully
  otpStore.delete(email); // Clean up used OTP
  res.json({ success: true, message: "OTP verified successfully" });
});

// Create account after OTP verification
app.post("/api/create-account", async (req, res) => {
  const { fullName, email, password } = req.body;

  if (!fullName || !email || !password) {
    return res.status(400).json({ error: "All fields are required." });
  }

  try {
    // Create auth account
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email,
      password: password,
    });

    if (authError) {
      console.error("Signup Error:", authError.message);
      return res.status(400).json({ error: "Signup Failed: " + authError.message });
    }

    // Insert user data
    const { data: insertData, error: insertError } = await supabase
      .from("users")
      .insert([
        {
          id: authData.user.id,
          name: fullName,
          email: email,
          role: "Job Seeker",
        },
      ]);

    if (insertError) {
      console.error("Insert Error:", insertError.message);
      return res.status(400).json({ error: "Database Insert Failed: " + insertError.message });
    }

    // Send welcome email
    const welcomeMailOptions = {
      from: process.env.EMAIL_USER || 'no1747878@gmail.com',
      to: email,
      subject: "Welcome to ManageJob!",
      text: `Hi ${fullName},\n\nWelcome to ManageJob! Your account has been successfully created.\n\nYou can now log in and start exploring job opportunities that match your skills and experience.\n\nBest regards,\nManageJob Team`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #4a86e8;">Welcome to ManageJob!</h2>
          <p>Hi ${fullName},</p>
          <p>Thank you for joining ManageJob! Your account has been successfully created.</p>
          <p>You can now log in and start exploring job opportunities that match your skills and experience.</p>
          <div style="margin: 20px 0;">
            <a href="https://managejob.com/login" style="background-color: #4a86e8; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Login to Your Account</a>
          </div>
          <p>Best regards,<br>ManageJob Team</p>
        </div>
      `
    };

    await transporter.sendMail(welcomeMailOptions);

    res.json({ success: true, message: "Account created successfully" });
  } catch (err) {
    console.error("Account creation error:", err);
    res.status(500).json({ error: "Failed to create account" });
  }
});


app.get("/api/user-details/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const { data, error } = await supabase
      .from("user_details")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/user-details/:userId", async (req, res) => {
  const { userId } = req.params;
  const {
    full_name,
    phone,
    email,
    gender,
    dob,
    address,
    education,
    skills,
    curr_role,
    resume_link,
    languages,
    internships,
    projects,
    profile_summary,
    accomplishments,
    competitive_exams,
    employment,
    academic_achievements,
  } = req.body;

  try {
    const { data, error } = await supabase
      .from("user_details")
      .update({
        full_name,
        phone,
        email,
        gender,
        dob,
        address,
        education,
        skills,
        curr_role,
        resume_link,
        languages,
        internships,
        projects,
        profile_summary,
        accomplishments,
        competitive_exams,
        employment,
        academic_achievements,
      })
      .eq("user_id", userId)
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ message: "User details updated successfully", data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/profile/:email", async (req, res) => {
  const { email } = req.params;

  try {
    const { data, error } = await supabase
      .from("user_details")
      .select("*")
      .eq("email", email)
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/profile/update", async (req, res) => {
  const { full_name, email, phone, experience, education, field_of_study, institution, graduation_year, achievements, skills, curr_role, resume_link, profile_picture, portfolio_links, linkedin_sync } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required." });
  }

  try {
    const { data, error } = await supabase
      .from("user_details")
      .update({
        full_name,
        phone,
        experience,
        education,
        field_of_study,
        institution,
        graduation_year,
        achievements,
        skills,
        curr_role,
        resume_link,
        profile_picture,
        portfolio_links,
        linkedin_sync,
      })
      .eq("email", email)
      .select();

    if (error) throw error;

    res.json({ message: "Profile updated successfully!", data: data[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/jobs', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('is_active', true);

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('Error fetching jobs:', err);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});


app.get('/api/recruiter/jobs', authenticateToken, async (req, res) => {
  try {
    const recruiter_id = req.user.id;
    console.log('Fetching jobs for recruiter_id:', recruiter_id);

    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select('*')
      .eq('recruiter_id', recruiter_id)
      .eq('is_active', true);

    if (jobsError) throw jobsError;

    const jobsWithApplies = await Promise.all(
      jobs.map(async (job) => {
        const { count, error: countError } = await supabase
          .from('job_applications')
          .select('*', { count: 'exact', head: true })
          .eq('job_id', job.id);

        if (countError) throw countError;

        console.log(`Job ID: ${job.id}, Application count: ${count || 0}`);
        return { ...job, applies: count || 0 };
      })
    );

    console.log('Jobs with applies:', jobsWithApplies);
    res.json(jobsWithApplies);
  } catch (err) {
    console.error('Error fetching recruiter jobs:', err);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// job apply
app.post('/api/apply-job', authenticateToken, async (req, res) => {
  try {
    const { job_id } = req.body;
    const user_id = req.user.id;

    console.log('Request body:', req.body);
    console.log('Authenticated user:', req.user);

    // Input validation: Check if job_id is a valid UUID string
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!job_id || typeof job_id !== 'string' || !uuidRegex.test(job_id)) {
      console.log('Invalid job_id:', job_id);
      return res.status(400).json({ 
        error: 'Invalid job_id. Must be a valid UUID string' 
      });
    }

    console.log('Applying to job:', { job_id, user_id });

    // Check if job exists
    console.log('Checking job existence...');
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id')
      .eq('id', job_id)
      .eq('is_active', true)
      .single();

    if (jobError || !job) {
      console.log('Job check failed:', jobError || 'No job data');
      return res.status(404).json({ 
        error: 'Job not found or no longer active' 
      });
    }
    console.log('Job found:', job);

    // Check for existing application
    console.log('Checking existing application...');
    const { data: existingApplication, error: existingError } = await supabase
      .from('job_applications')
      .select('user_id, job_id') // Select existing columns instead of 'id'
      .eq('user_id', user_id)
      .eq('job_id', job_id)
      .maybeSingle(); // Use maybeSingle since no row is expected if no application exists

    if (existingApplication) {
      console.log('Duplicate application found:', existingApplication);
      return res.status(409).json({ 
        error: 'You have already applied to this job' 
      });
    }
    if (existingError && existingError.code !== 'PGRST116') { // PGRST116 is "no rows" error
      console.log('Existing application check error:', existingError);
      throw existingError;
    }
    console.log('No existing application found');

    // Create application
    console.log('Creating application...');
    const applicationData = {
      user_id,
      job_id,
      status: 'applied',
      created_at: new Date().toISOString()
    };
    console.log('Application data to insert:', applicationData);
    
    const { data, error } = await supabase
      .from('job_applications')
      .insert(applicationData)
      .select('user_id, job_id, status, created_at') // Explicitly select existing columns
      .single();

    if (error) {
      console.log('Insert error:', error);
      throw error;
    }

    console.log('Application created:', data);
    res.status(201).json({ 
      message: 'Application submitted successfully', 
      application: data 
    });
  } catch (err) {
    console.error('Error applying to job:', {
      message: err.message,
      stack: err.stack,
      code: err.code,
      details: err.details
    });
    
    if (err.code === '23503') { // Foreign key violation
      return res.status(400).json({ 
        error: 'Invalid user or job reference' 
      });
    }

    res.status(500).json({ 
      error: 'Failed to apply to job',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Fetch user's applications
app.get('/api/user-applications', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.id;
    const { data, error } = await supabase
      .from('job_applications')
      .select('job_id') // This is fine since we just need job_id
      .eq('user_id', user_id);

    if (error) throw error;

    const appliedJobIds = data.map(app => app.job_id);
    res.json(appliedJobIds);
  } catch (err) {
    console.error('Error fetching user applications:', err);
    res.status(500).json({ error: 'Failed to fetch user applications' });
  }
});

app.post('/api/jobs', authenticateToken, async (req, res) => {
  try {
    const {
      company,
      job_title,
      location,
      min_salary,
      max_salary,
      job_type,
      job_description,
      skills,
      min_experience,
      max_experience,
      work_mode,
      industry,
      qualification,
      vacancies,
      requirements,
      perks,
      candidate_profile,
      about_company,
      employment_category,
      expiry_date, // Add expiry_date to destructured fields
    } = req.body;

    console.log('Received job posting data:', req.body);
    console.log('Recruiter ID:', req.user.id);

    if (!job_title || !company) {
      return res.status(400).json({ error: 'Job title and company are required' });
    }

    const { data, error } = await supabase
      .from('jobs')
      .insert({
        recruiter_id: req.user.id,
        company,
        job_title,
        location,
        min_salary,
        max_salary,
        job_type,
        job_description,
        skills,
        min_experience,
        max_experience,
        work_mode,
        industry,
        qualification,
        vacancies,
        requirements,
        perks,
        candidate_profile,
        about_company,
        employment_category,
        created_at: new Date().toISOString(),
        expiry_date, // Add expiry_date to the insert
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      throw error;
    }

    console.log('Job created:', data);
    res.status(201).json({ message: 'Job posted successfully', job: data });
  } catch (err) {
    console.error('Error creating job:', err.message);
    res.status(500).json({ error: err.message || 'Failed to create job posting' });
  }
});

// Fetch job details for saved jobs
app.get('/api/jobs/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .eq('is_active', true)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Job not found' });

    res.json(data);
  } catch (err) {
    console.error('Error fetching job:', err);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

app.get('/api/reviews', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .order('timestamp', { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('Error fetching reviews:', err);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

app.get('/api/reviews/search', async (req, res) => {
  const { company } = req.query;
  
  try {
    let query = supabase
      .from('reviews')
      .select('*')
      .order('timestamp', { ascending: false });
    
    if (company) {
      query = query.ilike('company', `%${company}%`);
    }
    
    const { data, error } = await query;

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('Error searching reviews:', err);
    res.status(500).json({ error: 'Failed to search reviews' });
  }
});

app.get('/api/reviews/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    
    if (!data) {
      return res.status(404).json({ error: 'Review not found' });
    }

    res.json(data);
  } catch (err) {
    console.error('Error fetching review:', err);
    res.status(500).json({ error: 'Failed to fetch review' });
  }
});

app.post('/api/reviews', authenticateToken, async (req, res) => {
  const {
    company,
    department,
    rating,
    review,
    work_life_balance,
    salary,
    promotions,
    job_security,
    skill_development,
    work_satisfaction,
    company_culture,
    gender
  } = req.body;

  if (!company || !rating || !review) {
    return res.status(400).json({ error: 'Company, rating, and review are required' });
  }

  try {
    const { data, error } = await supabase
      .from('reviews')
      .insert({
        company,
        department,
        rating,
        review,
        work_life_balance,
        salary,
        promotions,
        job_security,
        skill_development,
        work_satisfaction,
        company_culture,
        gender,
        likes: 0,
        dislikes: 0,
        timestamp: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ message: 'Review submitted successfully', review: data });
  } catch (err) {
    console.error('Error submitting review:', err);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

app.put('/api/reviews/:id/vote', async (req, res) => {
  const { id } = req.params;
  const { action } = req.body;
  
  if (!action || (action !== 'like' && action !== 'dislike')) {
    return res.status(400).json({ error: 'Invalid action. Use "like" or "dislike"' });
  }
  
  try {
    const { data: review, error: getError } = await supabase
      .from('reviews')
      .select('likes, dislikes')
      .eq('id', id)
      .single();
    
    if (getError) throw getError;
    
    const updateData = {};
    if (action === 'like') {
      updateData.likes = (review.likes || 0) + 1;
    } else {
      updateData.dislikes = (review.dislikes || 0) + 1;
    }
    
    const { data, error } = await supabase
      .from('reviews')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
      
    if (error) throw error;
    
    res.json({ message: `Review ${action}d successfully`, review: data });
  } catch (err) {
    console.error(`Error updating review ${action}:`, err);
    res.status(500).json({ error: `Failed to ${action} review` });
  }
});

app.post('/api/search-candidates', authenticateToken, async (req, res) => {
  try {
    const {
      fullName,
      skills,
      experience,
      currRole,
      education,
      fieldOfStudy,
      institution,
      jobType,
      availability,
      prefLocation,
      gender,
      minAge,
      maxAge,
      languages,
      graduationYear,
    } = req.body;

    console.log('Search filters:', req.body);

    let query = supabase
      .from('user_details')
      .select('*');

    if (fullName) query = query.ilike('full_name', `%${fullName}%`);
    if (skills) query = query.ilike('skills', `%${skills}%`);
    if (experience) {
      const { data, error } = await query;
      
      if (error) throw error;
      
      const filteredData = data.filter(candidate => {
        const expYears = parseFloat(candidate.experience.replace(/[^0-9.]/g, '')) || 0;
        return expYears >= parseFloat(experience);
      });
      
      res.json(filteredData);
      return;
    }
    if (currRole) query = query.ilike('curr_role', `%${currRole}%`);
    if (education) query = query.ilike('education', `%${education}%`);
    if (fieldOfStudy) query = query.ilike('field_of_study', `%${fieldOfStudy}%`);
    if (institution) query = query.ilike('institution', `%${institution}%`);
    if (jobType) query = query.eq('job_type', jobType);
    if (availability) query = query.eq('availability', availability);
    if (prefLocation) query = query.ilike('pref_location', `%${prefLocation}%`);
    if (gender && gender !== 'All') query = query.eq('gender', gender);
    if (languages) query = query.ilike('languages', `%${languages}%`);
    if (graduationYear) {
      query = query.gte('graduation_year', graduationYear);
    }

    if (minAge || maxAge) {
      const currentYear = new Date().getFullYear();
      if (minAge) {
        const maxDob = new Date(`${currentYear - minAge}-12-31`).toISOString().split('T')[0];
        query = query.lte('dob', maxDob);
      }
      if (maxAge) {
        const minDob = new Date(`${currentYear - maxAge}-01-01`).toISOString().split('T')[0];
        query = query.gte('dob', minDob);
      }
    }

    const { data, error } = await query;

    if (error) throw error;

    console.log('Found candidates:', data);
    res.json(data);
  } catch (err) {
    console.error('Error searching candidates:', err);
    res.status(500).json({ error: err.message || 'Failed to search candidates' });
  }
});

app.get('/api/job-applications/:jobId', authenticateToken, async (req, res) => {
  const { jobId } = req.params;
  const recruiterId = req.user.id;

  try {
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, job_title, company')
      .eq('id', jobId)
      .eq('recruiter_id', recruiterId)
      .single();

    if (jobError || !job) {
      return res.status(404).json({ error: 'Job not found or you do not have permission' });
    }

    const { data: applications, error } = await supabase
      .from('job_applications')
      .select(`
        user_id,
        job_id,
        status,
        created_at,
        user_details (
          full_name,
          email,
          skills,
          experience,
          curr_role,
          education,
          resume_link
        ),
        jobs (
          job_title,
          company
        )
      `)
      .eq('job_id', jobId);

    if (error) throw error;

    res.json(applications);
  } catch (err) {
    console.error('Error fetching job applications:', err);
    res.status(500).json({ error: 'Failed to fetch job applications' });
  }
});

app.put('/api/job-applications/:jobId/:userId', authenticateToken, async (req, res) => {
  const { jobId, userId } = req.params;
  const { status } = req.body;
  const recruiterId = req.user.id;

  try {
    // Check if the job exists and belongs to the recruiter
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, job_title, company')
      .eq('id', jobId)
      .eq('recruiter_id', recruiterId)
      .single();

    if (jobError || !job) {
      return res.status(404).json({ error: 'Job not found or you do not have permission' });
    }

    // Update the application status
    const { data: updatedApplication, error: updateError } = await supabase
      .from('job_applications')
      .update({ status })
      .eq('job_id', jobId)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError) throw updateError;

    if (!updatedApplication) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Fetch candidate details
    const { data: candidate, error: candidateError } = await supabase
      .from('user_details')
      .select('full_name, email')
      .eq('user_id', userId)
      .single();

    if (candidateError || !candidate) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    // Send email notification
    const { job_title: jobTitle, company } = job;
    const { full_name: candidateName, email: candidateEmail } = candidate;
    const { subject, text } = getEmailContent(status, jobTitle, company, candidateName);

    const mailOptions = {
      from: process.env.EMAIL_USER || 'no1747878@gmail.com',
      to: candidateEmail,
      subject,
      text,
    };

    await transporter.sendMail(mailOptions);

    res.json({ 
      message: 'Application status updated successfully and email sent', 
      application: updatedApplication 
    });
  } catch (err) {
    console.error('Error updating application status:', err);
    res.status(500).json({ error: 'Failed to update application status' });
  }
});

// Get user's saved jobs
app.get('/api/user-saved-jobs', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const { data, error } = await supabase
      .from('users')
      .select('saved_jobs')
      .eq('id', userId)
      .single();
    
    if (error) {
      console.error('Error fetching saved jobs:', error);
      return res.status(500).json({ error: 'Error fetching saved jobs' });
    }
    
    if (!data) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Return empty array if saved_jobs is null
    const savedJobs = data.saved_jobs || [];
    res.json(savedJobs);
  } catch (error) {
    console.error('Error fetching saved jobs:', error);
    res.status(500).json({ error: 'Server error fetching saved jobs' });
  }
});

// Save a job
app.post('/api/save-job', authenticateToken, async (req, res) => {
  try {
    const { job_id } = req.body;
    const userId = req.user.id;
    
    if (!job_id) {
      return res.status(400).json({ error: 'Job ID is required' });
    }
    
    // First get the current saved_jobs array
    const { data: userData, error: fetchError } = await supabase
      .from('users')
      .select('saved_jobs')
      .eq('id', userId)
      .single();
    
    if (fetchError) {
      console.error('Error fetching user data:', fetchError);
      return res.status(500).json({ error: 'Error fetching user data' });
    }
    
    if (!userData) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Initialize saved_jobs array if null
    const currentSavedJobs = userData.saved_jobs || [];
    
    // Add job_id if not already in the array
    if (!currentSavedJobs.includes(job_id.toString())) {
      const updatedSavedJobs = [...currentSavedJobs, job_id.toString()];
      
      const { data, error: updateError } = await supabase
        .from('users')
        .update({ saved_jobs: updatedSavedJobs })
        .eq('id', userId)
        .select('saved_jobs');
      
      if (updateError) {
        console.error('Error saving job:', updateError);
        return res.status(500).json({ error: 'Error saving job' });
      }
      
      return res.json({ message: 'Job saved successfully', saved_jobs: data[0].saved_jobs });
    }
    
    // Job was already saved
    return res.json({ message: 'Job already saved', saved_jobs: currentSavedJobs });
  } catch (error) {
    console.error('Error saving job:', error);
    res.status(500).json({ error: 'Server error saving job' });
  }
});

// Remove a saved job
app.post('/api/remove-saved-job', authenticateToken, async (req, res) => {
  try {
    const { job_id } = req.body;
    const userId = req.user.id;
    
    if (!job_id) {
      return res.status(400).json({ error: 'Job ID is required' });
    }
    
    // First get the current saved_jobs array
    const { data: userData, error: fetchError } = await supabase
      .from('users')
      .select('saved_jobs')
      .eq('id', userId)
      .single();
    
    if (fetchError) {
      console.error('Error fetching user data:', fetchError);
      return res.status(500).json({ error: 'Error fetching user data' });
    }
    
    if (!userData) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Initialize saved_jobs array if null
    const currentSavedJobs = userData.saved_jobs || [];
    
    // Remove job_id from the array
    const updatedSavedJobs = currentSavedJobs.filter(id => id !== job_id.toString());
    
    const { data, error: updateError } = await supabase
      .from('users')
      .update({ saved_jobs: updatedSavedJobs })
      .eq('id', userId)
      .select('saved_jobs');
    
    if (updateError) {
      console.error('Error removing saved job:', updateError);
      return res.status(500).json({ error: 'Error removing saved job' });
    }
    
    return res.json({ message: 'Job removed successfully', saved_jobs: data[0].saved_jobs });
  } catch (error) {
    console.error('Error removing saved job:', error);
    res.status(500).json({ error: 'Server error removing saved job' });
  }
});

// New search endpoint for SearchResume
app.post('/api/search', authenticateToken, async (req, res) => {
  try {
    const {
      fullName,
      email,
      phone,
      skills,
      markAllSkillsAsMandatory,
      experience,
      location,
      prefLocation,
      includeRelocateWilling,
      pinCode,
      company,
      currRole,
      education,
      educationDetailed,
      fieldOfStudy,
      institution,
      graduationYear,
      jobType,
      gender,
      achievements,
      activePeriod // Note: Ignored as not in schema
    } = req.body;

    console.log('Search criteria:', req.body);

    let query = supabase
      .from('user_details')
      .select('*');

    // Apply filters based on criteria
    if (fullName) query = query.ilike('full_name', `%${fullName}%`);
    if (email) query = query.ilike('email', `%${email}%`);
    if (phone) query = query.eq('phone', phone);
    if (skills) {
      if (markAllSkillsAsMandatory) {
        const skillsArray = skills.split(',').map(s => s.trim()).filter(s => s);
        skillsArray.forEach(skill => {
          query = query.ilike('skills', `%${skill}%`);
        });
      } else {
        query = query.ilike('skills', `%${skills}%`);
      }
    }
    if (experience?.min) {
      query = query.gte('experience', experience.min);
    }
    if (experience?.max) {
      query = query.lte('experience', experience.max);
    }
    if (location) query = query.ilike('address', `%${location}%`);
    if (prefLocation && includeRelocateWilling) {
      query = query.ilike('pref_location', `%${prefLocation}%`);
    }
    if (pinCode) query = query.eq('pin_code', pinCode);
    if (company) query = query.ilike('company', `%${company}%`);
    if (currRole) query = query.ilike('curr_role', `%${currRole}%`);
    if (education) query = query.ilike('education', `%${education}%`);
    if (educationDetailed) query = query.ilike('education_detailed', `%${educationDetailed}%`);
    if (fieldOfStudy) query = query.ilike('field_of_study', `%${fieldOfStudy}%`);
    if (institution) query = query.ilike('institution', `%${institution}%`);
    if (graduationYear) query = query.eq('graduation_year', graduationYear);
    if (jobType && !jobType.includes('Any')) {
      query = query.in('job_type', jobType);
    }
    if (gender && gender !== 'Any') query = query.eq('gender', gender);
    if (achievements) query = query.ilike('achievements', `%${achievements}%`);

    const { data, error } = await query;

    if (error) throw error;

    console.log('Search results:', data);
    res.json({
      success: true,
      results: data,
      total: data.length
    });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({
      success: false,
      message: 'An error occurred while searching.'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});