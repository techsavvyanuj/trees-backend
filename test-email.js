import dotenv from 'dotenv';
import { sendOTPEmail } from './services/emailService.js';

dotenv.config();

const testEmail = async () => {
  console.log('🧪 Testing SendGrid Email Service...\n');

  try {
    // Test sending a registration OTP
    await sendOTPEmail(
      'test@example.com', // Replace with your email to test
      '123456',
      'registration'
    );

    console.log('\n✅ Email test completed successfully!');
    console.log('📧 Check your inbox for the OTP email');
  } catch (error) {
    console.error('\n❌ Email test failed:', error.message);
  }

  process.exit(0);
};

testEmail();
